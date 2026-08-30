#!/usr/bin/env node
// Alta en bloque de colonos existentes en PRODUCCIÓN a partir de un JSON —
// ver tarea 2 en TASKS.md. Pensado para dar de alta de golpe a los colonos
// que ya viven en el fraccionamiento al lanzar el reglamento nuevo, sin
// pasar por el flujo de registro/aprobación ni por el alta uno-por-uno de
// AdminPage (`adminCreateColono`, functions/src/index.ts) — mismo shape de
// datos que esa función escribe, mismo patrón dry-run/--confirm que
// push-to-prod.mjs / migrate-users-role.mjs.
//
// Formato del JSON (ver scripts/preregister-colonos.example.json):
//   {
//     "colonos": [
//       { "calle": "Nogal", "numero_casa": 35, "nombre_completo": "...",
//         "telefono": "5512345678", "email": "..." }
//     ]
//   }
// `telefono` acepta con o sin +52/52 al inicio — se normaliza a 10 dígitos.
// `email` es opcional (string vacío o ausente = sin correo); hoy solo se
// guarda como dato en el perfil, no crea ningún método de acceso (login
// sigue siendo solo teléfono — ver tarea 4 en TASKS.md).
//
// Comportamiento ante filas problemáticas (decisión explícita, no aborta el
// batch completo):
//   - Teléfono que ya tiene cuenta en producción → se omite (re-correr el
//     script sobre el mismo archivo, o uno ampliado, es seguro).
//   - Calle inválida / teléfono mal formado / nombre vacío / domicilio ya
//     con 2 colonos → se omite esa fila, se reporta al final, se sigue con
//     las demás.
//
// Por default corre en modo dry-run: solo muestra qué crearía. Hay que
// pasar --confirm explícitamente para que escriba de verdad.
//
// Uso:
//   node scripts/preregister-colonos.mjs --file=colonos.json
//   node scripts/preregister-colonos.mjs --file=colonos.json --confirm
//
// Requiere credenciales de producción vía Application Default Credentials:
//   gcloud auth application-default login
// o GOOGLE_APPLICATION_CREDENTIALS apuntando a un service account key
// (nunca commitear esa key — ver .gitignore).

import { readFileSync } from 'node:fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = 'padel-toscana'
const VALID_STREETS = ['Nogal', 'Olivo', 'Encino']
const MAX_USERS_PER_ADDRESS = 2

function parseArgs() {
  const args = process.argv.slice(2)
  const fileArg = args.find((a) => a.startsWith('--file='))
  const confirm = args.includes('--confirm')

  if (!fileArg) {
    console.error('Falta --file=ruta/al/colonos.json')
    process.exit(1)
  }

  return { filePath: fileArg.replace('--file=', ''), confirm }
}

function loadColonos(filePath) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (err) {
    console.error(`No se pudo leer ${filePath}: ${err.message}`)
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`${filePath} no es JSON válido: ${err.message}`)
    process.exit(1)
  }
  if (!Array.isArray(parsed?.colonos)) {
    console.error(`${filePath} debe tener la forma { "colonos": [...] }`)
    process.exit(1)
  }
  return parsed.colonos
}

// Normaliza a exactamente 10 dígitos MX — acepta con o sin +52/52 al inicio.
function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2)
  return null
}

function normalizeStreet(raw) {
  const match = VALID_STREETS.find((s) => s.toLowerCase() === String(raw ?? '').trim().toLowerCase())
  return match ?? null
}

// Valida una fila del JSON y regresa { ok: true, colono } o { ok: false, reason }.
// No toca red/Firestore — solo shape de los datos.
function validateRow(row, index) {
  const label = `fila ${index + 1}`

  const street = normalizeStreet(row.calle)
  if (!street) return { ok: false, reason: `${label}: calle inválida ("${row.calle}")` }

  const streetNumber = String(row.numero_casa ?? '').trim()
  if (!streetNumber) return { ok: false, reason: `${label}: falta numero_casa` }

  const name = String(row.nombre_completo ?? '').trim()
  if (name.length < 2) return { ok: false, reason: `${label}: nombre_completo inválido` }

  const phone = normalizePhone(row.telefono)
  if (!phone) return { ok: false, reason: `${label}: teléfono inválido ("${row.telefono}")` }

  const email = String(row.email ?? '').trim() || null

  return { ok: true, colono: { street, streetNumber, name, phone: `+52${phone}`, email } }
}

function getProdApp() {
  return initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
}

async function loadExistingAddressUids(db) {
  const snap = await db.collection('addresses').get()
  const map = new Map()
  for (const doc of snap.docs) {
    map.set(doc.id, [...(doc.data().uids ?? [])])
  }
  return map
}

async function main() {
  const { filePath, confirm } = parseArgs()
  const rows = loadColonos(filePath)

  console.log('════════════════════════════════════════════════════════')
  console.log(`  preregister-colonos → proyecto: ${PROJECT_ID}`)
  console.log(`  archivo: ${filePath} (${rows.length} fila(s))`)
  console.log(`  modo: ${confirm ? '⚠️  ESCRITURA REAL EN PRODUCCIÓN' : 'dry-run (no se escribe nada)'}`)
  console.log('════════════════════════════════════════════════════════\n')

  const app = getProdApp()
  const db = getFirestore(app)
  const auth = getAuth(app)

  const addressUids = await loadExistingAddressUids(db)

  const created = []
  const skipped = []

  for (let i = 0; i < rows.length; i++) {
    const validated = validateRow(rows[i], i)
    if (!validated.ok) {
      skipped.push(validated.reason)
      console.log(`  ⊘ ${validated.reason}`)
      continue
    }
    const { street, streetNumber, name, phone, email } = validated.colono
    const addressKey = `${street} ${streetNumber}`.toLowerCase()

    // Teléfono ya existente en producción → re-corrida segura, se omite.
    const existingAuthUser = await auth.getUserByPhoneNumber(phone).catch(() => null)
    if (existingAuthUser) {
      const reason = `fila ${i + 1}: ${name} (${phone}) ya tiene cuenta — se omite`
      skipped.push(reason)
      console.log(`  ⊘ ${reason}`)
      continue
    }

    const currentUids = addressUids.get(addressKey) ?? []
    if (currentUids.length >= MAX_USERS_PER_ADDRESS) {
      const reason = `fila ${i + 1}: ${street} ${streetNumber} ya tiene ${MAX_USERS_PER_ADDRESS} colonos — se omite ${name}`
      skipped.push(reason)
      console.log(`  ⊘ ${reason}`)
      continue
    }

    if (!confirm) {
      console.log(`  [dry-run] crearía a ${name} — ${street} ${streetNumber}, ${phone}${email ? `, ${email}` : ''}`)
      // Reserva el cupo en memoria para que otra fila del mismo domicilio,
      // más abajo en el archivo, vea el cupo correctamente ocupado.
      addressUids.set(addressKey, [...currentUids, `[dry-run:${name}]`])
      created.push({ name, street, streetNumber, phone })
      continue
    }

    let newUid
    try {
      const authUser = await auth.createUser({ phoneNumber: phone, displayName: name })
      newUid = authUser.uid
    } catch (err) {
      const reason = `fila ${i + 1}: no se pudo crear la cuenta de Auth para ${name} (${err.message})`
      skipped.push(reason)
      console.log(`  ⊘ ${reason}`)
      continue
    }

    try {
      await db.doc(`users/${newUid}`).set({
        name,
        street,
        streetNumber,
        address: `${street} ${streetNumber}`,
        addressNormalized: addressKey,
        phone,
        email,
        role: 'colono',
        status: 'active',
        createdAt: Timestamp.now(),
      })
      await db.doc(`addresses/${addressKey}`).set(
        { uids: [...new Set([...currentUids, newUid])] },
        { merge: true },
      )
    } catch (err) {
      // No dejar una cuenta de Auth huérfana si el write de Firestore falla
      // — mismo patrón defensivo que adminCreateColono.
      await auth.deleteUser(newUid).catch(() => {})
      const reason = `fila ${i + 1}: no se pudo escribir Firestore para ${name} (${err.message})`
      skipped.push(reason)
      console.log(`  ⊘ ${reason}`)
      continue
    }

    addressUids.set(addressKey, [...currentUids, newUid])
    created.push({ name, street, streetNumber, phone })
    console.log(`  ✓ ${name} — ${street} ${streetNumber}, ${phone}`)
  }

  console.log('\nResumen:')
  console.log(`  ${confirm ? 'creados' : 'se crearían'}: ${created.length}`)
  console.log(`  omitidos: ${skipped.length}`)
  if (skipped.length > 0) {
    console.log('\nFilas omitidas:')
    skipped.forEach((s) => console.log(`  - ${s}`))
  }

  if (!confirm) {
    console.log('\nEsto fue un dry-run — nada se escribió. Vuelve a correr con --confirm para aplicar en producción.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('preregister-colonos falló:', err)
  process.exit(1)
})

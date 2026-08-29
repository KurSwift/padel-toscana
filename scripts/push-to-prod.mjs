#!/usr/bin/env node
// Migra colecciones seleccionadas del emulador local de Firestore hacia
// PRODUCCIÓN. Pensado para llevar configuración curada en local (p. ej.
// canchas nuevas) a producción de forma controlada — NO es una herramienta
// de sync/backup general, y sobreescribe (set, no merge) los documentos
// destino que compartan id.
//
// Por default corre en modo dry-run: solo muestra qué escribiría. Hay que
// pasar --confirm explícitamente para que escriba de verdad en producción.
//
// Uso:
//   node scripts/push-to-prod.mjs --collections=courts
//   node scripts/push-to-prod.mjs --collections=courts,reservations --confirm
//
// Requiere credenciales de producción vía Application Default Credentials:
//   gcloud auth application-default login
// o GOOGLE_APPLICATION_CREDENTIALS apuntando a un service account key
// (nunca commitear esa key — ver .gitignore).
//
// Requiere que el emulador de Firestore esté corriendo (`npm run emulators`).

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'padel-toscana'
const ALLOWED_COLLECTIONS = ['courts', 'addresses', 'users', 'reservations']
const BATCH_SIZE = 400

function parseArgs() {
  const args = process.argv.slice(2)
  const collectionsArg = args.find((a) => a.startsWith('--collections='))
  const confirm = args.includes('--confirm')

  if (!collectionsArg) {
    console.error(
      `Falta --collections=coleccion1,coleccion2\nColecciones permitidas: ${ALLOWED_COLLECTIONS.join(', ')}`,
    )
    process.exit(1)
  }

  const collections = collectionsArg
    .replace('--collections=', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const invalid = collections.filter((c) => !ALLOWED_COLLECTIONS.includes(c))
  if (invalid.length > 0) {
    console.error(
      `Colección(es) no permitida(s): ${invalid.join(', ')}\nPermitidas: ${ALLOWED_COLLECTIONS.join(', ')}`,
    )
    process.exit(1)
  }

  return { collections, confirm }
}

// Instancia separada apuntando explícitamente al emulador vía .settings(),
// en vez de la variable de entorno FIRESTORE_EMULATOR_HOST — esa variable
// es global por proceso y contaminaría también la conexión a producción.
function getEmulatorDb() {
  const app = initializeApp({ projectId: PROJECT_ID }, 'emulator-source')
  const db = getFirestore(app)
  db.settings({ host: '127.0.0.1:8080', ssl: false })
  return db
}

function getProdDb() {
  const app = initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    'prod-target',
  )
  return getFirestore(app)
}

async function migrateCollection(source, target, name, confirm) {
  const snap = await source.collection(name).get()
  console.log(`\n${name}: ${snap.size} documento(s) en el emulador local.`)

  if (snap.empty) return { name, count: 0 }

  if (!confirm) {
    snap.docs.slice(0, 5).forEach((d) => console.log(`  [dry-run] escribiría ${name}/${d.id}`))
    if (snap.size > 5) console.log(`  ...y ${snap.size - 5} más.`)
    return { name, count: snap.size }
  }

  let batch = target.batch()
  let inBatch = 0
  for (const doc of snap.docs) {
    batch.set(target.collection(name).doc(doc.id), doc.data())
    inBatch++
    if (inBatch === BATCH_SIZE) {
      await batch.commit()
      batch = target.batch()
      inBatch = 0
    }
  }
  if (inBatch > 0) await batch.commit()

  console.log(`  ✓ ${snap.size} documento(s) escritos en producción.`)
  return { name, count: snap.size }
}

async function main() {
  const { collections, confirm } = parseArgs()

  console.log('════════════════════════════════════════════════════════')
  console.log(`  push-to-prod → proyecto: ${PROJECT_ID}`)
  console.log(`  colecciones: ${collections.join(', ')}`)
  console.log(`  modo: ${confirm ? '⚠️  ESCRITURA REAL EN PRODUCCIÓN' : 'dry-run (no se escribe nada)'}`)
  console.log('════════════════════════════════════════════════════════')

  const source = getEmulatorDb()
  const target = getProdDb()

  const results = []
  for (const name of collections) {
    results.push(await migrateCollection(source, target, name, confirm))
  }

  console.log('\nResumen:')
  results.forEach((r) => console.log(`  ${r.name}: ${r.count} documento(s)`))

  if (!confirm) {
    console.log('\nEsto fue un dry-run — nada se escribió. Vuelve a correr con --confirm para aplicar en producción.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('push-to-prod falló:', err)
  process.exit(1)
})

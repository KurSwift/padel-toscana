#!/usr/bin/env node
// Migración one-off: convierte el campo booleano `isAdmin` de los usuarios
// existentes en PRODUCCIÓN al nuevo campo `role: 'colono' | 'admin' |
// 'tesorero'` (issue 2/7 del épico #10 — nunca introdujo el rol 'tesorero'
// para usuarios existentes; hay que asignarlo a mano después desde el panel
// admin si aplica). Corre una sola vez, contra producción — no toca el
// emulador.
//
// Por default corre en modo dry-run: solo muestra qué escribiría. Hay que
// pasar --confirm explícitamente para que escriba de verdad.
//
// Uso:
//   node scripts/migrate-users-role.mjs
//   node scripts/migrate-users-role.mjs --confirm
//
// Requiere credenciales de producción vía Application Default Credentials:
//   gcloud auth application-default login
// o GOOGLE_APPLICATION_CREDENTIALS apuntando a un service account key
// (nunca commitear esa key — ver .gitignore).

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'padel-toscana'

function getProdDb() {
  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  return getFirestore(app)
}

async function main() {
  const confirm = process.argv.includes('--confirm')

  console.log('════════════════════════════════════════════════════════')
  console.log(`  migrate-users-role → proyecto: ${PROJECT_ID}`)
  console.log(`  modo: ${confirm ? '⚠️  ESCRITURA REAL EN PRODUCCIÓN' : 'dry-run (no se escribe nada)'}`)
  console.log('════════════════════════════════════════════════════════')

  const db = getProdDb()
  const snap = await db.collection('users').get()
  console.log(`\n${snap.size} usuario(s) en producción.`)

  const toMigrate = snap.docs.filter((d) => d.data().role === undefined)
  console.log(`${toMigrate.length} usuario(s) sin campo "role" (tienen "isAdmin" viejo).`)

  if (toMigrate.length === 0) {
    console.log('Nada que migrar.')
    process.exit(0)
  }

  for (const docSnap of toMigrate) {
    const data = docSnap.data()
    const role = data.isAdmin === true ? 'admin' : 'colono'
    console.log(`  ${confirm ? '' : '[dry-run] '}users/${docSnap.id}: isAdmin=${data.isAdmin} → role='${role}'`)

    if (confirm) {
      await docSnap.ref.update({ role, isAdmin: FieldValue.delete() })
    }
  }

  if (!confirm) {
    console.log('\nEsto fue un dry-run — nada se escribió. Vuelve a correr con --confirm para aplicar.')
  } else {
    console.log(`\n✓ ${toMigrate.length} usuario(s) migrados a "role".`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('migrate-users-role falló:', err)
  process.exit(1)
})

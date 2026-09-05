#!/usr/bin/env node
// Borra todas las colecciones de la app en el emulador de Firestore, para
// arrancar de un estado limpio antes de `npm run seed` — útil después de
// probar algo a mano (p. ej. una reservación o cancha de prueba creada
// directo en la Emulator UI o con un script ad-hoc) sin dejar residuos.
//
// A diferencia de push-to-prod.mjs/migrate-users-role.mjs/
// preregister-colonos.mjs, este script NO tiene ningún camino hacia
// producción: fuerza FIRESTORE_EMULATOR_HOST sin importar el entorno (no
// usa `??=` como seed.mjs), así que no hay bandera --confirm que lo
// desbloquee ni forma de apuntarlo a otro proyecto por accidente.
//
// Requiere que el emulador de Firestore ya esté corriendo:
//   npm run emulators   (en otra terminal)
//   npm run clear-emulator-data
//   npm run seed        (opcional, para repoblar)

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'padel-toscana'
// Todas las colecciones que la app escribe — ver "Estructura" en AGENTS.md.
const COLLECTIONS = ['reservations', 'courts', 'users', 'addresses', 'rateLimits', 'mail', 'settings']
const BATCH_SIZE = 400 // margen bajo el límite de 500 writes/batch de Firestore.

const db = getFirestore(initializeApp({ projectId: PROJECT_ID }))

async function clearCollection(name) {
  const snap = await db.collection(name).get()
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) batch.delete(doc.ref)
    await batch.commit()
  }
  return snap.docs.length
}

async function main() {
  console.log(`Borrando datos del emulador de Firestore (proyecto: ${PROJECT_ID})...`)
  for (const name of COLLECTIONS) {
    const count = await clearCollection(name)
    console.log(`  ${name}: ${count} doc(s) borrados`)
  }
  console.log('\nListo. Corre `npm run seed` para repoblar con datos de ejemplo.')
  console.log('Nota: esto NO borra las cuentas de Auth del emulador — npm run seed')
  console.log('las reutiliza por uid fijo, así que no hace falta.')
  process.exit(0)
}

main().catch((err) => {
  console.error('clear-emulator-data falló:', err)
  process.exit(1)
})

#!/usr/bin/env node
// Prepobla el emulador de Firestore/Auth con datos de ejemplo para
// desarrollo local. Requiere que los emuladores ya estén corriendo:
//
//   npm run emulators   (en otra terminal)
//   npm run seed
//
// No toca producción — apunta explícitamente a los puertos del emulador.

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = 'padel-toscana'

const app = initializeApp({ projectId: PROJECT_ID })
const db = getFirestore(app)
const auth = getAuth(app)

// Debe reflejar DEFAULT_COURT_SETTINGS en src/services/courts.ts.
const DEFAULT_COURT_SETTINGS = {
  openTime: '07:00',
  closeTime: '23:00',
  minDurationHours: 1,
  maxDurationHours: 2,
  slotIntervalMinutes: 60,
  maxActiveReservationsPerUser: 2,
  daysAheadAllowed: 7,
  minLeadHours: 24,
  paymentDeadlineHours: 12,
  reservationFee: 300,
}

const COURTS = [
  { id: 'court-1', name: 'Cancha Principal', isActive: true, settings: DEFAULT_COURT_SETTINGS },
  { id: 'court-2', name: 'Cancha Secundaria', isActive: false, settings: DEFAULT_COURT_SETTINGS },
]

// uid fijo por usuario para que sea reproducible entre corridas de seed.
// El teléfono es lo que se usa para "iniciar sesión como" ese usuario en
// el emulador (cualquier código OTP sirve ahí, o se lee el real en la
// Emulator UI → Authentication).
const SEED_USERS = [
  { uid: 'seed-admin', phone: '+525500000001', name: 'Admin Seed', street: 'Nogal', streetNumber: '1', role: 'admin', status: 'active' },
  { uid: 'seed-active-1', phone: '+525500000002', name: 'Ana Activa', street: 'Olivo', streetNumber: '12', role: 'colono', status: 'active' },
  { uid: 'seed-active-2', phone: '+525500000003', name: 'Beto Activo', street: 'Encino', streetNumber: '5', role: 'colono', status: 'active' },
  { uid: 'seed-pending-1', phone: '+525500000004', name: 'Carla Pendiente', street: 'Nogal', streetNumber: '20', role: 'colono', status: 'pending' },
  { uid: 'seed-tesorero-1', phone: '+525500000005', name: 'Tere Tesorera', street: 'Encino', streetNumber: '8', role: 'tesorero', status: 'active' },
]

// Crea (o reutiliza) el usuario de Auth para cada seed, con uid fijo, para
// que el login por teléfono en el emulador resuelva siempre al mismo perfil.
async function seedAuthUsers() {
  for (const u of SEED_USERS) {
    await auth.createUser({ uid: u.uid, phoneNumber: u.phone }).catch((err) => {
      if (err.code !== 'auth/uid-already-exists') throw err
    })
  }
}

async function seedCourts() {
  for (const c of COURTS) {
    await db.doc(`courts/${c.id}`).set({
      name: c.name,
      isActive: c.isActive,
      settings: c.settings,
      createdAt: Timestamp.now(),
    })
  }
}

// Crea el perfil de Firestore (users/{uid}) y su entrada correspondiente en
// addresses/{addressKey}, replicando lo que hace registerUser() en
// src/services/users.ts (sin pasar por el flujo de UI).
async function seedUsersAndAddresses() {
  for (const u of SEED_USERS) {
    const addressKey = `${u.street} ${u.streetNumber}`.toLowerCase()
    await db.doc(`users/${u.uid}`).set({
      name: u.name,
      street: u.street,
      streetNumber: u.streetNumber,
      address: `${u.street} ${u.streetNumber}`,
      addressNormalized: addressKey,
      phone: u.phone,
      role: u.role,
      status: u.status,
      createdAt: Timestamp.now(),
    })
    await db.doc(`addresses/${addressKey}`).set({ uids: [u.uid] })
  }
}

// Reservaciones de ejemplo para poder probar cancelación, confirmación de
// pago, expiración "lazy" (issue 4/7) y las vistas de "Mis reservaciones" /
// panel admin sin reservar manualmente. El seed usa firebase-admin y no
// pasa por firestore.rules, así que puede escribir cualquier
// status/startAt/endAt/paymentDueAt directo, incluso combinaciones que la
// app nunca produciría por sí sola (como la ya-expirada de abajo).
async function seedReservations() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDate = tomorrow.toISOString().slice(0, 10)

  // Empieza en 2h (dentro de las 24h de minLeadHours si se creara vía la
  // app — pero el seed no pasa por esa validación) y su paymentDueAt
  // (startAt - 12h) ya quedó en el pasado: sirve para probar que
  // effectiveStatus() la libera de inmediato al cargar la app, sin haber
  // tocado el documento manualmente.
  const soon = new Date()
  soon.setHours(soon.getHours() + 2, 0, 0, 0)
  const soonEnd = new Date(soon)
  soonEnd.setHours(soonEnd.getHours() + 1)

  const sample = [
    {
      ownerUid: 'seed-active-1', status: 'solicitada',
      date: tomorrowDate, startTime: '10:00', endTime: '11:00',
      startAt: new Date(`${tomorrowDate}T10:00:00`), endAt: new Date(`${tomorrowDate}T11:00:00`),
      playerCount: 4, residentInChargeName: 'Ana Activa',
    },
    {
      ownerUid: 'seed-active-2', status: 'pagada',
      date: tomorrowDate, startTime: '17:00', endTime: '18:00',
      startAt: new Date(`${tomorrowDate}T17:00:00`), endAt: new Date(`${tomorrowDate}T18:00:00`),
      playerCount: 6, residentInChargeName: 'Beto Activo',
    },
    {
      // Ya expirada por falta de pago — ver comentario arriba.
      ownerUid: 'seed-active-1', status: 'solicitada',
      date: soon.toISOString().slice(0, 10),
      startTime: `${String(soon.getHours()).padStart(2, '0')}:00`,
      endTime: `${String(soonEnd.getHours()).padStart(2, '0')}:00`,
      startAt: soon, endAt: soonEnd,
      playerCount: 4, residentInChargeName: 'Ana Activa',
    },
  ]

  for (const s of sample) {
    const owner = SEED_USERS.find((u) => u.uid === s.ownerUid)
    const paymentDeadlineHours = DEFAULT_COURT_SETTINGS.paymentDeadlineHours
    const paymentDueAt = new Date(s.startAt.getTime() - paymentDeadlineHours * 60 * 60 * 1000)
    await db.collection('reservations').add({
      courtId: COURTS[0].id,
      userId: owner.uid,
      userName: owner.name,
      userAddress: `${owner.street} ${owner.streetNumber}`,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      durationHours: 1,
      status: s.status,
      startAt: Timestamp.fromDate(s.startAt),
      endAt: Timestamp.fromDate(s.endAt),
      paymentDueAt: Timestamp.fromDate(paymentDueAt),
      playerCount: s.playerCount,
      residentInChargeName: s.residentInChargeName,
      createdAt: Timestamp.now(),
    })
  }
}

async function main() {
  console.log(`Sembrando datos de prueba en el emulador (proyecto: ${PROJECT_ID})...`)
  await seedAuthUsers()
  await seedCourts()
  await seedUsersAndAddresses()
  await seedReservations()

  console.log('\nListo. Usuarios de prueba (entra por teléfono en /login):')
  for (const u of SEED_USERS) {
    console.log(`  ${u.phone}  →  ${u.name}  (${u.role}, ${u.status})`)
  }
  console.log('\nEmulator UI: http://127.0.0.1:4000')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed falló:', err)
  process.exit(1)
})

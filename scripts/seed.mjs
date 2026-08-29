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
  maxDurationHours: 3,
  slotIntervalMinutes: 60,
  maxActiveReservationsPerUser: 1,
  daysAheadAllowed: 7,
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
  { uid: 'seed-active-1', phone: '+525500000002', name: 'Ana Activa', street: 'Olivos', streetNumber: '12', role: 'colono', status: 'active' },
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

// Una reservación de ejemplo hoy, para poder probar cancelación y las
// vistas de "Mis reservaciones" / panel admin sin reservar manualmente.
async function seedReservations() {
  const today = new Date().toISOString().slice(0, 10)
  const owner = SEED_USERS.find((u) => u.uid === 'seed-active-1')
  await db.collection('reservations').add({
    courtId: COURTS[0].id,
    userId: owner.uid,
    userName: owner.name,
    userAddress: `${owner.street} ${owner.streetNumber}`,
    date: today,
    startTime: '10:00',
    endTime: '11:00',
    durationHours: 1,
    status: 'active',
    createdAt: Timestamp.now(),
  })
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

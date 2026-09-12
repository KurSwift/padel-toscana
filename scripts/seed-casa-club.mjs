#!/usr/bin/env node
// Prepobla el emulador con reservaciones de casa club de ejemplo en
// distintos estados y meses — reservar una por una a mano desde la UI para
// tener suficientes datos con los que ver el calendario público (issue
// 8/8 del épico #60) o "Depósitos por resolver" en TesoreroPage es lento;
// este script las escribe directo.
//
// Requiere haber corrido `npm run seed` antes (reutiliza sus usuarios de
// prueba por uid fijo — Ana Activa, Beto Activo, Tere Tesorera — y el
// recurso `casa-club-1` que ya siembra). No toca producción — apunta
// explícitamente a los puertos del emulador.
//
//   npm run emulators        (terminal 1)
//   npm run seed             (terminal 2 — usuarios/canchas/reservaciones base)
//   npm run seed:casa-club   (terminal 2)

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const PROJECT_ID = 'padel-toscana'
// Debe ser el mismo id que crea `scripts/seed.mjs` para el recurso
// casa-club — de lo contrario este script crea un SEGUNDO recurso de tipo
// casa-club, y `useCourtData` (que asume uno solo por tipo) toma el primero
// que encuentra, dejando el otro huérfano.
const COURT_ID = 'casa-club-1'

const db = getFirestore(initializeApp({ projectId: PROJECT_ID }))

// Debe reflejar DEFAULT_COURT_SETTINGS_BY_TYPE['casa-club'] en
// src/services/courts.ts (issue 1/8 del épico #60).
const CASA_CLUB_SETTINGS = {
  openTime: '00:00',
  closeTime: '23:59',
  minDurationHours: 24,
  maxDurationHours: 24,
  slotIntervalMinutes: 1440,
  maxActiveReservationsPerUser: 2,
  daysAheadAllowed: 90,
  minLeadHours: 72,
  paymentDeadlineHours: 24,
  reservationFee: 3000,
  maxPlayerCount: 30,
  depositAmount: 3000,
  depositRefundableAmount: 2000,
  cancellationDeadlineHours: 48,
  maxReservationsPerUserPerMonth: 2,
}

// Mismos usuarios fijos que scripts/seed.mjs — este script asume que ya
// corrió y que estos uid/perfiles existen.
const ANA = { uid: 'seed-active-1', name: 'Ana Activa', address: 'Olivo 12' }
const BETO = { uid: 'seed-active-2', name: 'Beto Activo', address: 'Encino 5' }

function dateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function dateStr(d) {
  return d.toISOString().slice(0, 10)
}

// Reservación de día completo (issue 2/8): startTime/endTime =
// openTime/closeTime del recurso, durationHours = minDurationHours — mismo
// bloque fijo que deriva createReservation (functions/src/index.ts, issue
// 3/8) para casa club. paymentDueAt = createdAt + paymentDueHoursFromNow —
// para Casa Club el plazo de pago cuenta desde que se reserva, no desde el
// evento (ver computePaymentDueAt en reservationRules.ts de cliente/functions).
function fullDayReservation({ id, owner, status, dayOffset, paymentDueHoursFromNow = 0 }) {
  const day = dateOffset(dayOffset)
  const date = dateStr(day)
  const startAt = new Date(`${date}T${CASA_CLUB_SETTINGS.openTime}:00`)
  const endAt = new Date(`${date}T${CASA_CLUB_SETTINGS.closeTime}:00`)
  const createdAt = new Date()
  const paymentDueAt = new Date(createdAt.getTime() + paymentDueHoursFromNow * 60 * 60 * 1000)

  return {
    id,
    doc: {
      courtId: COURT_ID,
      courtType: 'casa-club',
      userId: owner.uid,
      userName: owner.name,
      userAddress: owner.address,
      date,
      startTime: CASA_CLUB_SETTINGS.openTime,
      endTime: CASA_CLUB_SETTINGS.closeTime,
      durationHours: CASA_CLUB_SETTINGS.minDurationHours,
      status,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      paymentDueAt: Timestamp.fromDate(paymentDueAt),
      playerCount: 25,
      residentInChargeName: owner.name,
      createdAt: Timestamp.fromDate(createdAt),
    },
  }
}

const RESERVATIONS = [
  // Pendiente de pago, a futuro (+10 días — cumple minLeadHours 72h y
  // daysAheadAllowed 90) — aparece en TesoreroPage → "Pagos pendientes",
  // junto con las de cancha del seed base.
  fullDayReservation({
    id: 'casa-club-res-pendiente',
    owner: ANA,
    status: 'solicitada',
    dayOffset: 10,
    paymentDueHoursFromNow: CASA_CLUB_SETTINGS.paymentDeadlineHours,
  }),
  // Pagada, a futuro (+20 días) — sigue "ocupando" el recurso (cuenta para
  // el tope mensual y bloquea ese día), pero el evento no ha pasado: no
  // debe aparecer en "Depósitos por resolver" todavía.
  fullDayReservation({ id: 'casa-club-res-activa', owner: BETO, status: 'pagada', dayOffset: 20 }),
  // Pagada, con endAt en el pasado (-3 días) — effectiveStatus() la muestra
  // como 'finalizada' sin haber tocado el documento. Issue 4/8 (este PR):
  // debe aparecer en TesoreroPage → "Depósitos por resolver".
  fullDayReservation({ id: 'casa-club-res-finalizada-1', owner: ANA, status: 'pagada', dayOffset: -3 }),
  // Segunda ya finalizada, de otro colono — para probar que la lista de
  // "Depósitos por resolver" maneja más de una entrada.
  fullDayReservation({ id: 'casa-club-res-finalizada-2', owner: BETO, status: 'pagada', dayOffset: -10 }),
]

async function seedCourt() {
  await db.doc(`courts/${COURT_ID}`).set({
    name: 'Casa Club',
    isActive: true,
    type: 'casa-club',
    settings: CASA_CLUB_SETTINGS,
    createdAt: Timestamp.now(),
  })
}

async function seedReservations() {
  for (const { id, doc } of RESERVATIONS) {
    await db.doc(`reservations/${id}`).set(doc)
  }
}

async function main() {
  console.log(`Sembrando casa club en el emulador (proyecto: ${PROJECT_ID})...`)
  await seedCourt()
  await seedReservations()

  console.log(`\nListo. Cancha "Casa Club" (${COURT_ID}) + ${RESERVATIONS.length} reservaciones:`)
  console.log('  casa-club-res-pendiente     — solicitada, +10 días (Pagos pendientes)')
  console.log('  casa-club-res-activa        — pagada, +20 días (ocupa el mes, no finalizada)')
  console.log('  casa-club-res-finalizada-1  — pagada, endAt hace 3 días (Depósitos por resolver)')
  console.log('  casa-club-res-finalizada-2  — pagada, endAt hace 10 días (Depósitos por resolver)')
  console.log('\nEntra como tesorero (+525500000005) para ver "Pagos pendientes" y "Depósitos por resolver".')
  process.exit(0)
}

main().catch((err) => {
  console.error('seed-casa-club falló:', err)
  process.exit(1)
})

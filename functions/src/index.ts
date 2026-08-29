// Única Cloud Function del repo. Cierra el gap documentado en AGENTS.md
// ("Excepción conocida") y CONTEXT.md ("Gaps / deuda conocida"): el límite
// de reservaciones activas por usuario y la detección de traslapes de
// horario requieren queries agregadas que firestore.rules no puede hacer
// (solo get() de documentos puntuales) — antes solo se validaban del lado
// del cliente en src/services/reservations.ts, con un check-then-write NO
// atómico. Esta función corre con Admin SDK (bypasea firestore.rules) y
// hace el check + write dentro de una transacción de Firestore.
//
// firestore.rules ahora deniega `create` en reservations por completo
// (`allow create: if false`) — esta función es la ÚNICA vía legítima para
// crear una reservación. También deriva userId/userName/userAddress del
// lado del servidor (de request.auth.uid y users/{uid}) en vez de confiar
// en lo que mande el cliente — cierra un vector de spoofing adicional que
// el `addDoc` directo del cliente tenía antes.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import {
  hasOverlap,
  countOccupyingReservations,
  OCCUPYING_STATUSES,
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  isPlayerCountValid,
  isResidentInChargeNameValid,
  computePaymentDueAt,
} from './reservationRules'
import { toDate, addHours } from './time'

initializeApp()
const db = getFirestore()

interface CreateReservationInput {
  courtId: string
  date: string
  startTime: string
  durationHours: number
  playerCount: number
  residentInChargeName: string
}

// ¿`data` tiene la forma mínima esperada? No es una validación de negocio
// (esas vienen después, con mensajes de error específicos) — solo evita
// que un `undefined`/tipo equivocado tumbe la función con un error críptico.
function isValidInput(data: unknown): data is CreateReservationInput {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.courtId === 'string' &&
    typeof d.date === 'string' &&
    typeof d.startTime === 'string' &&
    typeof d.durationHours === 'number' &&
    typeof d.playerCount === 'number' &&
    typeof d.residentInChargeName === 'string'
  )
}

export const createReservation = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'unauthenticated')
    }
    if (!isValidInput(request.data)) {
      throw new HttpsError('invalid-argument', 'invalid-argument')
    }
    const uid = request.auth.uid
    const { courtId, date, startTime, durationHours, playerCount } = request.data
    const residentInChargeName = request.data.residentInChargeName.trim()

    const [userSnap, courtSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`courts/${courtId}`).get(),
    ])

    if (!userSnap.exists) throw new HttpsError('failed-precondition', 'user-not-found')
    const user = userSnap.data() as { name: string; address: string; status?: string }
    if (user.status !== 'active') throw new HttpsError('failed-precondition', 'inactive-user')

    if (!courtSnap.exists) throw new HttpsError('failed-precondition', 'court-not-found')
    const court = courtSnap.data() as {
      settings: {
        closeTime: string
        maxActiveReservationsPerUser: number
        minLeadHours: number
        daysAheadAllowed: number
        paymentDeadlineHours: number
      }
    }

    const endTime = addHours(startTime, durationHours)

    if (endTime > court.settings.closeTime) throw new HttpsError('failed-precondition', 'outside-hours')
    if (!isDurationWithinHardCap(durationHours)) {
      throw new HttpsError('failed-precondition', 'duration-too-long')
    }
    if (!isPlayerCountValid(playerCount)) {
      throw new HttpsError('failed-precondition', 'invalid-player-count')
    }
    if (!isResidentInChargeNameValid(residentInChargeName)) {
      throw new HttpsError('failed-precondition', 'resident-in-charge-required')
    }

    const startAt = toDate(date, startTime)
    const endAt = toDate(date, endTime)
    const now = new Date()

    if (!isLeadTimeSufficient(startAt, now, court.settings.minLeadHours)) {
      throw new HttpsError('failed-precondition', 'lead-time-too-short')
    }
    if (!isWithinMaxAdvanceWindow(startAt, now, court.settings.daysAheadAllowed)) {
      throw new HttpsError('failed-precondition', 'too-far-ahead')
    }

    const newRef = db.collection('reservations').doc()

    await db.runTransaction(async (tx) => {
      // Reservaciones activas del usuario (límite maxActiveReservationsPerUser).
      const userQuery = db
        .collection('reservations')
        .where('userId', '==', uid)
        .where('status', 'in', OCCUPYING_STATUSES)
      const userReservationsSnap = await tx.get(userQuery)
      const userReservations = userReservationsSnap.docs.map((d) => ({ status: d.get('status') as string }))
      if (countOccupyingReservations(userReservations) >= court.settings.maxActiveReservationsPerUser) {
        throw new HttpsError('failed-precondition', 'max-reservations')
      }

      // Traslapes en la misma cancha/día.
      const dayQuery = db
        .collection('reservations')
        .where('courtId', '==', courtId)
        .where('date', '==', date)
        .where('status', 'in', OCCUPYING_STATUSES)
      const daySnap = await tx.get(dayQuery)
      const existing = daySnap.docs.map((d) => ({
        startTime: d.get('startTime') as string,
        endTime: d.get('endTime') as string,
      }))
      if (hasOverlap(existing, startTime, endTime)) {
        throw new HttpsError('failed-precondition', 'slot-taken')
      }

      tx.set(newRef, {
        courtId,
        userId: uid,
        userName: user.name,
        userAddress: user.address,
        date,
        startTime,
        endTime,
        durationHours,
        status: 'solicitada',
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        paymentDueAt: Timestamp.fromDate(computePaymentDueAt(startAt, court.settings.paymentDeadlineHours)),
        playerCount,
        residentInChargeName,
        createdAt: FieldValue.serverTimestamp(),
      })
    })

    return { reservationId: newRef.id }
  },
)

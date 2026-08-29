import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { Court, Reservation, ReservationStatus } from '@/types'
import { addHours, toDate } from '@/utils/time'
import {
  hasOverlap,
  countOccupyingReservations,
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  computePaymentDueAt,
  effectiveStatus,
  OCCUPYING_STATUSES,
} from '@/services/reservationRules'

const ERRORS: Record<string, string> = {
  'slot-taken': 'Este horario ya fue reservado. Elige otro.',
  'max-reservations': 'Ya tienes el máximo de reservaciones activas permitido.',
  'outside-hours': 'El horario está fuera del rango permitido.',
  'duration-too-long': 'La duración máxima de una reservación es de 2 horas.',
  'lead-time-too-short': 'Debes reservar con al menos 24 horas de anticipación.',
  'too-far-ahead': 'No puedes reservar con tanta anticipación todavía.',
}

export function reservationErrorMessage(code: string): string {
  return ERRORS[code] ?? 'No se pudo crear la reservación. Intenta de nuevo.'
}

// Expiración "lazy" (issue 4/7 del épico #10): convierte docs crudos de
// Firestore a Reservation[] calculando el status *efectivo* (ver
// effectiveStatus en reservationRules.ts) en vez de confiar en el campo
// `status` guardado, que puede estar desactualizado porque no hay Cloud
// Functions que lo corrijan en el momento exacto en que expira. Además,
// dispara (sin esperar) una escritura correctiva en Firestore por cada doc
// cuyo status efectivo ya no coincide con el guardado — así el dato queda
// consistente para la siguiente lectura de cualquier usuario. Solo
// devuelve las reservaciones cuyo status efectivo sigue "ocupando" el
// horario (ver OCCUPYING_STATUSES); las que ya expiraron/finalizaron se
// excluyen del resultado aunque el doc en Firestore aún no se haya
// actualizado.
function toOccupyingReservations(docs: QueryDocumentSnapshot<DocumentData>[]): Reservation[] {
  const now = new Date()
  const result: Reservation[] = []

  for (const d of docs) {
    const data = d.data() as Omit<Reservation, 'id'>
    const status = effectiveStatus(
      { status: data.status, paymentDueAt: data.paymentDueAt.toDate(), endAt: data.endAt.toDate() },
      now,
    )

    if (status !== data.status) {
      updateDoc(d.ref, { status }).catch(() => {
        // Best-effort: si falla (otro cliente ya la actualizó, offline,
        // etc.) no pasa nada — la próxima lectura lo vuelve a intentar.
      })
    }

    if ((OCCUPYING_STATUSES as readonly string[]).includes(status)) {
      result.push({ id: d.id, ...data, status } as Reservation)
    }
  }

  return result
}

// Crea una reservación en status 'solicitada' (ocupa el horario, pendiente
// de pago hasta paymentDueAt — ver effectiveStatus() para el auto-release).
// Valida, en este orden: horario dentro de rango, tope duro de 2h,
// anticipación mínima/máxima, límite de reservaciones activas del usuario,
// y traslapes. Estas mismas validaciones (salvo el límite de activas, que
// requiere un conteo que las rules no pueden hacer) se repiten en
// firestore.rules.
export async function createReservation(params: {
  court: Court
  userId: string
  userName: string
  userAddress: string
  date: string
  startTime: string
  durationHours: number
}): Promise<void> {
  const { court, userId, userName, userAddress, date, startTime, durationHours } = params
  const endTime = addHours(startTime, durationHours)

  if (endTime > court.settings.closeTime) throw new Error('outside-hours')
  if (!isDurationWithinHardCap(durationHours)) throw new Error('duration-too-long')

  const startAt = toDate(date, startTime)
  const endAt = toDate(date, endTime)
  const now = new Date()

  if (!isLeadTimeSufficient(startAt, now, court.settings.minLeadHours)) {
    throw new Error('lead-time-too-short')
  }
  if (!isWithinMaxAdvanceWindow(startAt, now, court.settings.daysAheadAllowed)) {
    throw new Error('too-far-ahead')
  }

  // Check user active reservation limit
  const userSnap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('userId', '==', userId),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
  )
  const userReservations = toOccupyingReservations(userSnap.docs)
  if (countOccupyingReservations(userReservations) >= court.settings.maxActiveReservationsPerUser) {
    throw new Error('max-reservations')
  }

  // Check for time overlaps on this court/date
  const daySnap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('courtId', '==', court.id),
      where('date', '==', date),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
  )
  const existing = toOccupyingReservations(daySnap.docs)
  if (hasOverlap(existing, startTime, endTime)) {
    throw new Error('slot-taken')
  }

  await addDoc(collection(db, 'reservations'), {
    courtId: court.id,
    userId,
    userName,
    userAddress,
    date,
    startTime,
    endTime,
    durationHours,
    status: 'solicitada' satisfies ReservationStatus,
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    paymentDueAt: Timestamp.fromDate(computePaymentDueAt(startAt, court.settings.paymentDeadlineHours)),
    createdAt: serverTimestamp(),
  })
}

// El dueño (o un admin) cancela su reservación desde 'solicitada' o
// 'pagada'. La transición en sí (quién puede cancelar desde qué estado) la
// valida firestore.rules — ver canTransition() en reservationRules.ts.
export async function cancelReservation(reservationId: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', reservationId), {
    status: 'cancelada' satisfies ReservationStatus,
  })
}

// El tesorero (o un admin) confirma que una reservación 'solicitada' ya se
// pagó. Reforzado en firestore.rules — solo tesorero/admin, solo desde
// 'solicitada'.
export async function confirmPayment(reservationId: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', reservationId), {
    status: 'pagada' satisfies ReservationStatus,
  })
}

// Override manual de admin: cambia el status a cualquier valor, sin pasar
// por la matriz de transición normal (issue 6/7 del épico #10 — panel
// admin de reservaciones). Reforzado en firestore.rules: solo admin.
export async function setReservationStatus(
  reservationId: string,
  status: ReservationStatus,
): Promise<void> {
  await updateDoc(doc(db, 'reservations', reservationId), { status })
}

export function subscribeToReservations(
  courtId: string,
  date: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('courtId', '==', courtId),
      where('date', '==', date),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
    (snap) => onUpdate(toOccupyingReservations(snap.docs)),
  )
}

export function subscribeToAllReservationsByDate(
  date: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('date', '==', date),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
    (snap) => onUpdate(toOccupyingReservations(snap.docs)),
  )
}

export function subscribeToUserReservations(
  userId: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('userId', '==', userId),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
    (snap) => onUpdate(toOccupyingReservations(snap.docs)),
  )
}

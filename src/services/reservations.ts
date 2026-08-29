import {
  collection,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/firebase'
import { Court, Reservation, ReservationStatus } from '@/types'
import { addHours, toDate } from '@/utils/time'
import {
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  isPlayerCountValid,
  isResidentInChargeNameValid,
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
  'invalid-player-count': 'El número de jugadores debe ser entre 1 y 10.',
  'resident-in-charge-required': 'Indica el nombre del residente a cargo.',
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
// consistente para la siguiente lectura de cualquier usuario. Devuelve
// TODAS las reservaciones (los 4 estados) con su status corregido — usado
// por AdminPage, que necesita ver el historial completo de un día, no solo
// lo que ocupa el horario ahora mismo.
function toEffectiveReservations(docs: QueryDocumentSnapshot<DocumentData>[]): Reservation[] {
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

    result.push({ id: d.id, ...data, status } as Reservation)
  }

  return result
}

// Igual que toEffectiveReservations, pero solo devuelve las que siguen
// "ocupando" el horario (ver OCCUPYING_STATUSES) — usado por las vistas de
// colono, donde una reservación cancelada/finalizada no debe aparecer.
function toOccupyingReservations(docs: QueryDocumentSnapshot<DocumentData>[]): Reservation[] {
  return toEffectiveReservations(docs).filter((r) =>
    (OCCUPYING_STATUSES as readonly string[]).includes(r.status),
  )
}

const createReservationCallable = httpsCallable(functions, 'createReservation')

// Crea una reservación en status 'solicitada' (ocupa el horario, pendiente
// de pago hasta paymentDueAt — ver effectiveStatus() para el auto-release).
// Valida del lado del cliente, en este orden, solo lo que NO requiere leer
// otras reservaciones (para dar feedback instantáneo sin round-trip de
// red): horario dentro de rango, tope duro de 2h, rango de jugadores
// (1-10), que haya residente a cargo, y anticipación mínima/máxima. El
// límite de reservaciones activas del usuario y los traslapes de horario
// requieren un conteo/query agregada que un cliente podría saltarse
// escribiendo directo a Firestore — por eso esos dos, y el write en sí,
// los hace la Cloud Function `createReservation`
// (functions/src/index.ts, dentro de una transacción). El cliente
// re-valida todo lo de arriba igual, así que si la función rechaza la
// reservación por una razón que el cliente no anticipó, el código de
// error (`err.message`) es el mismo string que ya mapea
// reservationErrorMessage() — no hace falta un mapeo aparte.
// userId/userName/userAddress NO se mandan a la función: esta los deriva
// de request.auth.uid y de users/{uid} en Firestore, para que un cliente
// no pueda crear una reservación "como" otro usuario. Se quedan en la
// firma de esta función solo por compatibilidad con el caller (HomePage).
export async function createReservation(params: {
  court: Court
  userId: string
  userName: string
  userAddress: string
  date: string
  startTime: string
  durationHours: number
  playerCount: number
  residentInChargeName: string
}): Promise<void> {
  const { court, date, startTime, durationHours, playerCount } = params
  const residentInChargeName = params.residentInChargeName.trim()
  const endTime = addHours(startTime, durationHours)

  if (endTime > court.settings.closeTime) throw new Error('outside-hours')
  if (!isDurationWithinHardCap(durationHours)) throw new Error('duration-too-long')
  if (!isPlayerCountValid(playerCount)) throw new Error('invalid-player-count')
  if (!isResidentInChargeNameValid(residentInChargeName)) throw new Error('resident-in-charge-required')

  const startAt = toDate(date, startTime)
  const now = new Date()

  if (!isLeadTimeSufficient(startAt, now, court.settings.minLeadHours)) {
    throw new Error('lead-time-too-short')
  }
  if (!isWithinMaxAdvanceWindow(startAt, now, court.settings.daysAheadAllowed)) {
    throw new Error('too-far-ahead')
  }

  try {
    await createReservationCallable({
      courtId: court.id,
      date,
      startTime,
      durationHours,
      playerCount,
      residentInChargeName,
    })
  } catch (err) {
    // El SDK de Functions expone el segundo argumento de HttpsError como
    // `.message` — mismos códigos de string que ya usa reservationErrorMessage().
    throw new Error((err as { message?: string }).message ?? 'unknown-error')
  }
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

// A diferencia de subscribeToReservations/subscribeToUserReservations, NO
// filtra por status — usada por AdminPage (pestaña Reservaciones), que
// necesita ver los 4 estados de un día, incluyendo solicitada sin pagar,
// cancelada y finalizada (issue 6/7 del épico #10).
export function subscribeToAllReservationsByDate(
  date: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'reservations'), where('date', '==', date)),
    (snap) => onUpdate(toEffectiveReservations(snap.docs)),
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

// El tesorero ve todas las reservaciones 'solicitada' (pendientes de pago),
// sin importar la fecha ni la cancha — issue 7/7 del épico #10. Igual que
// las demás lecturas, corrige el status efectivo primero: una que ya
// expiró por falta de pago (issue 4/7) no debe aparecer aquí aunque el doc
// todavía diga 'solicitada'.
export function subscribeToPendingPayments(
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'reservations'), where('status', '==', 'solicitada')),
    (snap) => onUpdate(toEffectiveReservations(snap.docs).filter((r) => r.status === 'solicitada')),
  )
}

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
import { Court, CourtType, Reservation, ReservationStatus } from '@/types'
import { addHours, toDate } from '@/utils/time'
import {
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  isPlayerCountValid,
  isResidentInChargeNameValid,
  isCancellationAllowed,
  effectiveStatus,
  OCCUPYING_STATUSES,
} from '@/services/reservationRules'

// Ningún onSnapshot de este archivo tenía callback de error — si el listener
// fallaba (permission-denied transitorio, App Check, blip de red), el
// callback de éxito simplemente dejaba de dispararse para siempre y la UI
// se quedaba en su spinner de carga sin ninguna señal de qué pasó, sin
// reintento automático de Firestore. Este logger es el piso mínimo (consola)
// para las suscripciones que no exponen retry en la UI; las que sí lo
// exponen (subscribeToReservations, subscribeToUserReservations) además
// llaman a `onError` para que el hook que las usa pueda salir del estado de
// carga y ofrecer "Reintentar" en vez de girar indefinidamente.
function logSnapshotFailure(context: string, error: Error): void {
  console.error(`[reservations] onSnapshot falló (${context}):`, error)
}

const ERRORS: Record<string, string> = {
  'admin-only': 'Solo administración puede reservar para un colono.',
  'resident-not-found': 'El colono seleccionado ya no existe.',
  'invalid-resident': 'Selecciona un colono activo para reservar.',
  'inactive-user': 'Tu cuenta debe estar activa para reservar.',
  'rate-limited': 'Has realizado demasiados intentos. Espera unos minutos.',
  'slot-taken': 'Este horario ya fue reservado. Elige otro.',
  'max-reservations': 'Este usuario ya tiene el máximo de reservaciones activas permitido.',
  'outside-hours': 'El horario está fuera del rango permitido.',
  'duration-too-long': 'La duración máxima de una reservación es de 2 horas.',
  'too-far-ahead': 'No puedes reservar con tanta anticipación todavía.',
  'invalid-player-count': 'El número de personas está fuera del rango permitido.',
  'resident-in-charge-required': 'Indica el nombre del residente a cargo.',
  'monthly-limit': 'Este usuario ya alcanzó el máximo de reservaciones de este recurso para este mes.',
}

// 'lead-time-too-short' no vive en ERRORS: minLeadHours varía por recurso
// (24h cancha, 72h casa club, issue 6/8 del épico #60) — un texto fijo
// ("...al menos 24 horas...") queda mal para casa club aunque la
// anticipación real ya sea mayor a 24h, que es justo el caso confuso que
// reportó un colono probando el flujo. `minLeadHours` es opcional para no
// romper llamadas existentes que no lo tengan a mano (ninguna hoy, pero
// mantiene la función utilizable sin el dato).
export function reservationErrorMessage(code: string, minLeadHours?: number): string {
  if (code === 'lead-time-too-short') {
    return minLeadHours != null
      ? `Debes reservar con al menos ${minLeadHours} horas de anticipación.`
      : 'Debes reservar con más anticipación.'
  }
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
// red): horario dentro de rango, tope duro de 2h (solo cancha — casa club
// no lo tiene, su duración de 24h viene fija de settings, issue 6/8 del
// épico #60), rango de jugadores (court.settings.maxPlayerCount — 10
// cancha / 30 casa club), que haya residente a cargo, y anticipación
// mínima/máxima. El límite de reservaciones activas del usuario y los
// traslapes de horario
// requieren un conteo/query agregada que un cliente podría saltarse
// escribiendo directo a Firestore — por eso esos dos, y el write en sí,
// los hace la Cloud Function `createReservation`
// (functions/src/index.ts, dentro de una transacción). El cliente
// re-valida todo lo de arriba igual, así que si la función rechaza la
// reservación por una razón que el cliente no anticipó, el código de
// error (`err.message`) es el mismo string que ya mapea
// reservationErrorMessage() — no hace falta un mapeo aparte.
// targetUserId solo se envía desde el flujo administrativo. El servidor
// autoriza al actor y deriva nombre/domicilio del beneficiario en Firestore.
export async function createReservation(params: {
  court: Court
  targetUserId?: string
  date: string
  startTime: string
  durationHours: number
  playerCount: number
  residentInChargeName: string
}): Promise<void> {
  const { court, date, startTime, durationHours, playerCount } = params
  const residentInChargeName = params.residentInChargeName.trim()
  const endTime = addHours(startTime, durationHours)
  const isCasaClub = (court.type ?? 'cancha') === 'casa-club'

  // outside-hours no aplica a casa club — ver la nota espejo en
  // functions/src/index.ts (mismo bug encontrado probando el flujo real de
  // reserva del issue 6/8: addHours('00:00', 24) da '24:00', siempre mayor
  // a closeTime '23:59' aunque la reservación sea legítima).
  if (!isCasaClub && endTime > court.settings.closeTime) throw new Error('outside-hours')
  if (!isCasaClub && !isDurationWithinHardCap(durationHours)) throw new Error('duration-too-long')
  if (!isPlayerCountValid(playerCount, court.settings.maxPlayerCount)) throw new Error('invalid-player-count')
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
      ...(params.targetUserId !== undefined ? { targetUserId: params.targetUserId } : {}),
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
// Casa club exige cancellationDeadlineHours de anticipación (issue 5/8 del
// épico #60) — se valida aquí primero para dar feedback inmediato con el
// plazo exacto, antes del round-trip a Firestore; firestore.rules repite
// la misma validación del lado del servidor (isCancellationDeadlineRespected),
// pero un permission-denied ahí no puede traer un mensaje tan específico.
// Cancha no tiene plazo — court.settings.cancellationDeadlineHours es
// undefined para ese tipo, así que el chequeo se salta por completo.
export async function cancelReservation(
  reservationId: string,
  reservation: Reservation,
  court: Court,
): Promise<void> {
  const courtType = court.type ?? 'cancha'
  const deadlineHours = court.settings.cancellationDeadlineHours
  if (courtType === 'casa-club' && deadlineHours != null) {
    if (!isCancellationAllowed(reservation.startAt.toDate(), new Date(), deadlineHours)) {
      throw new Error(`Ya no se puede cancelar: se requieren al menos ${deadlineHours}h de anticipación.`)
    }
  }
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

// El tesorero (o un admin) decide, tras el evento, devolver o retener el
// depósito de una reservación de casa club (court.settings.
// depositRefundableAmount) — issue 4/8 del épico #60, exclusivo de ese tipo
// de recurso. Reforzado en firestore.rules — solo tesorero/admin, solo
// desde 'finalizada' y solo courtType 'casa-club'.
export async function returnDeposit(reservationId: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', reservationId), {
    status: 'deposito-devuelto' satisfies ReservationStatus,
  })
}

export async function retainDeposit(reservationId: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', reservationId), {
    status: 'deposito-retenido' satisfies ReservationStatus,
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
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('courtId', '==', courtId),
      where('date', '==', date),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
    (snap) => onUpdate(toOccupyingReservations(snap.docs)),
    (error) => {
      logSnapshotFailure('subscribeToReservations', error)
      onError?.(error)
    },
  )
}

// Suscribe las reservaciones ocupantes de un recurso en un rango inclusivo de
// fechas. CasaClubMonthCalendar la usa para marcar un mes completo sin hacer
// una lectura por cada día; el índice courtId+date ya cubre esta consulta.
export function subscribeToReservationsByDateRange(
  courtId: string,
  firstDate: string,
  lastDate: string,
  onUpdate: (reservations: Reservation[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('courtId', '==', courtId),
      where('date', '>=', firstDate),
      where('date', '<=', lastDate),
    ),
    (snap) => onUpdate(toOccupyingReservations(snap.docs)),
    (error) => {
      logSnapshotFailure('subscribeToReservationsByDateRange', error)
      onError?.(error)
    },
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
    (error) => logSnapshotFailure('subscribeToAllReservationsByDate', error),
  )
}

export function subscribeToUserReservations(
  userId: string,
  onUpdate: (reservations: Reservation[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('userId', '==', userId),
      where('status', 'in', OCCUPYING_STATUSES),
    ),
    (snap) => onUpdate(toOccupyingReservations(snap.docs)),
    (error) => {
      logSnapshotFailure('subscribeToUserReservations', error)
      onError?.(error)
    },
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
    (error) => logSnapshotFailure('subscribeToPendingPayments', error),
  )
}

// El tesorero ve las reservaciones de casa club ya 'finalizada' (el evento
// ya pasó) sin decisión de depósito todavía — issue 4/8 del épico #60. La
// query trae 'pagada' además de 'finalizada' por la misma razón que
// subscribeToPendingPayments: el status guardado puede no haberse corregido
// todavía a 'finalizada' (expiración lazy, ver effectiveStatus()).
// courtType se filtra en JS, no en la query — mismo motivo que en
// createReservation (functions/src/index.ts): un `.where('courtType', ...)`
// excluiría reservaciones sin ese campo denormalizado.
export function subscribeToPendingDepositDecisions(
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'reservations'), where('status', 'in', ['pagada', 'finalizada'])),
    (snap) =>
      onUpdate(
        toEffectiveReservations(snap.docs).filter(
          (r) => r.status === 'finalizada' && (r.courtType ?? 'cancha') === 'casa-club',
        ),
      ),
    (error) => logSnapshotFailure('subscribeToPendingDepositDecisions', error),
  )
}

export interface PublicCalendarEntry {
  date: string
  startTime: string
  endTime: string
  name: string
  address: string
}

// Calendario público (issue 8/8 del épico #60, PublicCalendarPage.tsx) —
// sin sesión iniciada, protegido solo por App Check (mismo patrón que
// getResidentsByAddress). `month` es 1-12. Nació exclusivo de casa club,
// se generalizó a cancha después — `courtType` decide cuál recurso
// consultar. Siempre trae startTime/endTime aunque casa club no los use
// para mostrar horario (siempre día completo) — el caller decide.
const getPublicCalendarCallable = httpsCallable(functions, 'getPublicCalendar')

export async function getPublicCalendar(
  year: number,
  month: number,
  courtType: CourtType,
): Promise<PublicCalendarEntry[]> {
  const result = await getPublicCalendarCallable({ year, month, courtType })
  return (result.data as { reservations: PublicCalendarEntry[] }).reservations
}

// Lógica de negocio de reservaciones que NO toca Firestore — funciones puras,
// fáciles de testear en aislamiento. `src/services/reservations.ts` las usa
// junto con las llamadas a Firestore; este archivo se mantiene libre de
// imports de `firebase/*` a propósito para que los tests no disparen la
// inicialización de la app (App Check, etc.). Los imports de tipos de
// `@/types` van como `import type` para que se borren en compilación y no
// arrastren accidentalmente `firebase/firestore` a los tests.
import type { ReservationStatus, UserRole } from '@/types'

// Estados que "ocupan" un horario: cuentan para traslapes (hasOverlap) y
// para el límite de reservaciones activas por usuario
// (countOccupyingReservations). 'cancelada' y 'finalizada' no ocupan.
export const OCCUPYING_STATUSES = ['solicitada', 'pagada'] as const

// Tope duro de duración, independiente de `court.settings.maxDurationHours`
// — así una configuración de cancha desactualizada nunca permite algo que
// el reglamento de colonos ya no permite.
export const MAX_RESERVATION_DURATION_HOURS = 2

// Rango total de asistentes permitido (no solo los que caben jugando a la
// vez — 4 en cancha es solo informativo, no una segunda validación).
export const MIN_PLAYER_COUNT = 1
export const MAX_PLAYER_COUNT = 10

// Determina si el rango [startTime, endTime) se traslapa con alguna
// reservación existente. Traslapa si empieza antes de que la otra termine
// y termina después de que la otra empieza (comparación de strings 'HH:mm',
// válido porque son strings con padding de dos dígitos).
export function hasOverlap(
  existing: { startTime: string; endTime: string }[],
  startTime: string,
  endTime: string,
): boolean {
  return existing.some((r) => startTime < r.endTime && endTime > r.startTime)
}

// Cuenta cuántas reservaciones de la lista están "ocupando" un cupo activo
// del usuario (ver OCCUPYING_STATUSES). Se usa para aplicar el límite de
// reservaciones activas por usuario (`maxActiveReservationsPerUser`).
export function countOccupyingReservations(reservations: { status: string }[]): number {
  return reservations.filter((r) =>
    (OCCUPYING_STATUSES as readonly string[]).includes(r.status),
  ).length
}

// ¿La duración cabe dentro del tope duro de 2h del reglamento de colonos?
export function isDurationWithinHardCap(durationHours: number): boolean {
  return durationHours <= MAX_RESERVATION_DURATION_HOURS
}

// ¿Falta al menos `minLeadHours` para el inicio de la reservación? Anticipa
// la validación equivalente en firestore.rules (comparando Timestamps).
export function isLeadTimeSufficient(startAt: Date, now: Date, minLeadHours: number): boolean {
  return startAt.getTime() - now.getTime() >= minLeadHours * 60 * 60 * 1000
}

// ¿El inicio de la reservación está dentro de la ventana máxima de
// anticipación permitida (`daysAheadAllowed`)? Convive con
// isLeadTimeSufficient — ambos límites aplican a la vez.
export function isWithinMaxAdvanceWindow(startAt: Date, now: Date, maxDaysAhead: number): boolean {
  return startAt.getTime() - now.getTime() <= maxDaysAhead * 24 * 60 * 60 * 1000
}

// paymentDueAt = startAt - paymentDeadlineHours, calculado al crear una
// reservación. Espejo puro de la resta equivalente en firestore.rules
// (isPaymentDueAtValid) — si cambia la fórmula, hay que actualizar ambos.
export function computePaymentDueAt(startAt: Date, paymentDeadlineHours: number): Date {
  return new Date(startAt.getTime() - paymentDeadlineHours * 60 * 60 * 1000)
}

// Calcula el status "real" de una reservación en el momento `now`, sin
// necesidad de que nadie haya escrito el cambio en Firestore todavía —
// expiración "lazy" (issue 4/7 del épico #10, decisión: sin Cloud
// Functions, para quedarnos en el plan Spark). src/services/reservations.ts
// usa esto en cada lectura para (a) calcular disponibilidad con el status
// real, y (b) escribir oportunistamente el status corregido cuando lo
// detecta. El orden de los checks importa: una 'solicitada' que nunca se
// pagó SIEMPRE se libera como 'cancelada', nunca 'finalizada', incluso si
// también ya pasó su `endAt` — porque paymentDueAt siempre es anterior (o
// igual) a endAt, así que si el pago nunca llegó, la reservación nunca fue
// legítima y no tiene sentido marcarla como "ocurrida".
export function effectiveStatus(
  reservation: { status: ReservationStatus; paymentDueAt: Date; endAt: Date },
  now: Date,
): ReservationStatus {
  if (reservation.status === 'solicitada' && now > reservation.paymentDueAt) {
    return 'cancelada'
  }
  if (
    (reservation.status === 'solicitada' || reservation.status === 'pagada') &&
    now > reservation.endAt
  ) {
    return 'finalizada'
  }
  return reservation.status
}

// ¿El número total de asistentes está dentro del rango permitido (1–10)?
export function isPlayerCountValid(playerCount: number): boolean {
  return Number.isInteger(playerCount) && playerCount >= MIN_PLAYER_COUNT && playerCount <= MAX_PLAYER_COUNT
}

// ¿El nombre del residente a cargo no está vacío (ignorando espacios)?
export function isResidentInChargeNameValid(name: string): boolean {
  return name.trim().length > 0
}

// Espejo puro de la matriz de transición de firestore.rules — si cambia la
// máquina de estados de una reservación, hay que actualizar esta función Y
// las rules (ver AGENTS.md). No decide si la reservación existe o si los
// demás campos son válidos, solo si este actor puede mover `from` a `to`.
// super-admin es superset de admin aquí también (ver isAdmin() en
// firestore.rules, que ya incluye a super-admin — Epic #43).
//
// Matriz:
//   solicitada → cancelada : dueño o admin/super-admin
//   pagada     → cancelada : dueño o admin/super-admin
//   solicitada → pagada    : tesorero o admin/super-admin
//   cualquier otra transición : solo admin/super-admin
export function canTransition(
  actor: { role: UserRole; isOwner: boolean },
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  if (actor.role === 'admin' || actor.role === 'super-admin') return true
  if (from === to) return false
  if ((from === 'solicitada' || from === 'pagada') && to === 'cancelada') {
    return actor.isOwner
  }
  if (from === 'solicitada' && to === 'pagada') {
    return actor.role === 'tesorero'
  }
  return false
}

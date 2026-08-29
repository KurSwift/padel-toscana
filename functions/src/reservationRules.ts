// Copia deliberada del subconjunto de src/services/reservationRules.ts que
// necesita la Cloud Function createReservation (ver ./index.ts). Inevitable:
// `firebase deploy --only functions` solo sube el árbol de functions/, no
// puede importar ../src/ del proyecto de Vite. Este archivo es ahora la
// AUTORIDAD real de estas reglas (la Cloud Function corre con Admin SDK y
// bypasea firestore.rules); src/services/reservationRules.ts se queda como
// validación de UX del cliente (feedback instantáneo antes del round-trip a
// la función). Tres lugares a mantener en sync si cambia una regla:
//   1. src/services/reservationRules.ts (UX del cliente)
//   2. functions/src/reservationRules.ts (este archivo — autoridad real)
//   3. firestore.rules (mucho más simple ahora — ver el bloque
//      `match /reservations/{reservationId}`)
// Los tests de este archivo (reservationRules.test.ts) espejan los casos de
// src/services/reservationRules.test.ts.

export const OCCUPYING_STATUSES = ['solicitada', 'pagada'] as const

// Tope duro de duración, independiente de court.settings.maxDurationHours.
export const MAX_RESERVATION_DURATION_HOURS = 2

export const MIN_PLAYER_COUNT = 1
export const MAX_PLAYER_COUNT = 10

// Determina si el rango [startTime, endTime) se traslapa con alguna
// reservación existente (comparación de strings 'HH:mm' con padding).
export function hasOverlap(
  existing: { startTime: string; endTime: string }[],
  startTime: string,
  endTime: string,
): boolean {
  return existing.some((r) => startTime < r.endTime && endTime > r.startTime)
}

// Cuenta cuántas reservaciones de la lista están "ocupando" un cupo activo
// del usuario (ver OCCUPYING_STATUSES).
export function countOccupyingReservations(reservations: { status: string }[]): number {
  return reservations.filter((r) =>
    (OCCUPYING_STATUSES as readonly string[]).includes(r.status),
  ).length
}

// ¿La duración cabe dentro del tope duro de 2h del reglamento de colonos?
export function isDurationWithinHardCap(durationHours: number): boolean {
  return durationHours <= MAX_RESERVATION_DURATION_HOURS
}

// ¿Falta al menos `minLeadHours` para el inicio de la reservación?
export function isLeadTimeSufficient(startAt: Date, now: Date, minLeadHours: number): boolean {
  return startAt.getTime() - now.getTime() >= minLeadHours * 60 * 60 * 1000
}

// ¿El inicio de la reservación está dentro de la ventana máxima de
// anticipación permitida (daysAheadAllowed)?
export function isWithinMaxAdvanceWindow(startAt: Date, now: Date, maxDaysAhead: number): boolean {
  return startAt.getTime() - now.getTime() <= maxDaysAhead * 24 * 60 * 60 * 1000
}

// paymentDueAt = startAt - paymentDeadlineHours.
export function computePaymentDueAt(startAt: Date, paymentDeadlineHours: number): Date {
  return new Date(startAt.getTime() - paymentDeadlineHours * 60 * 60 * 1000)
}

// ¿El número total de asistentes está dentro del rango permitido (1–10)?
export function isPlayerCountValid(playerCount: number): boolean {
  return Number.isInteger(playerCount) && playerCount >= MIN_PLAYER_COUNT && playerCount <= MAX_PLAYER_COUNT
}

// ¿El nombre del residente a cargo no está vacío (ignorando espacios)?
export function isResidentInChargeNameValid(name: string): boolean {
  return name.trim().length > 0
}

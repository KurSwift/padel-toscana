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

// Espejo puro de la matriz de transición de firestore.rules — si cambia la
// máquina de estados de una reservación, hay que actualizar esta función Y
// las rules (ver AGENTS.md). No decide si la reservación existe o si los
// demás campos son válidos, solo si este actor puede mover `from` a `to`.
//
// Matriz:
//   solicitada → cancelada : dueño o admin
//   pagada     → cancelada : dueño o admin
//   solicitada → pagada    : tesorero o admin
//   cualquier otra transición : solo admin
export function canTransition(
  actor: { role: UserRole; isOwner: boolean },
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  if (actor.role === 'admin') return true
  if (from === to) return false
  if ((from === 'solicitada' || from === 'pagada') && to === 'cancelada') {
    return actor.isOwner
  }
  if (from === 'solicitada' && to === 'pagada') {
    return actor.role === 'tesorero'
  }
  return false
}

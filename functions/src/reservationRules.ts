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

// Reservación de casa club = día completo (issue 2/8 del épico #60):
// startTime = court.settings.openTime, endTime = court.settings.closeTime,
// durationHours = court.settings.minDurationHours (== maxDurationHours) para
// ese tipo de recurso — ver DEFAULT_COURT_SETTINGS_BY_TYPE['casa-club'] en
// src/services/courts.ts ('00:00'/'23:59'/24). No hace falta lógica de
// traslape nueva: hasOverlap() ya bloquea el resto del día porque ese rango
// se traslapa con cualquier otro horario de la misma fecha.

// Determina si el rango [startTime, endTime) se traslapa con alguna
// reservación existente (comparación de strings 'HH:mm' con padding).
export function hasOverlap(
  existing: { startTime: string; endTime: string }[],
  startTime: string,
  endTime: string,
): boolean {
  return existing.some((r) => startTime < r.endTime && endTime > r.startTime)
}

// ¿La reservación es del tipo de recurso `courtType`? Fallback `?? 'cancha'`
// para docs sin courtType denormalizado (issue 1/8 del épico #60). Extraída
// como función pura testeable del fix del bug de conteo por tipo (issue 3/8
// — createReservation en ./index.ts): antes de este fix, el límite de
// reservaciones activas por usuario contaba TODAS sus reservaciones sin
// importar el recurso, así que un colono con sus reservaciones de cancha al
// tope quedaba bloqueado de reservar la casa club también, sin haberla
// usado nunca (y viceversa). El filtro va en JS, no en la query de
// Firestore (`.where('courtType', ...)` excluiría además reservaciones ya
// existentes en producción sin ese campo).
export function matchesCourtType(docCourtType: string | undefined, courtType: string): boolean {
  return (docCourtType ?? 'cancha') === courtType
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

// ¿El número total de asistentes está dentro del rango permitido? El máximo
// ya no es fijo (issue 2/8 del épico #60) — viene de
// court.settings.maxPlayerCount (10 en cancha, 30 en casa club). Default
// MAX_PLAYER_COUNT para no romper callers que todavía no leen ese campo.
export function isPlayerCountValid(
  playerCount: number,
  maxPlayerCount: number = MAX_PLAYER_COUNT,
): boolean {
  return Number.isInteger(playerCount) && playerCount >= MIN_PLAYER_COUNT && playerCount <= maxPlayerCount
}

// ¿Las reservaciones de casa club ocupantes del usuario en el mes calendario
// de `now` (reinicia el día 1) siguen debajo del tope
// maxReservationsPerUserPerMonth? `reservations` ya debe venir filtrada por
// el caller a las del usuario para el/los recurso(s) de tipo casa club
// (mismo contrato que countOccupyingReservations/hasOverlap — esta función
// no conoce userId ni courtId). Cancha no usa este límite.
export function isWithinMonthlyLimit(
  reservations: { status: string; startAt: Date }[],
  maxPerMonth: number,
  now: Date,
): boolean {
  const count = reservations.filter(
    (r) =>
      (OCCUPYING_STATUSES as readonly string[]).includes(r.status) &&
      r.startAt.getFullYear() === now.getFullYear() &&
      r.startAt.getMonth() === now.getMonth(),
  ).length
  return count < maxPerMonth
}

// ¿Falta al menos `cancellationDeadlineHours` para el inicio de la
// reservación? Exclusivo de casa club (issue 5/8) — cancha no tiene plazo,
// se puede cancelar en cualquier momento.
export function isCancellationAllowed(
  startAt: Date,
  now: Date,
  cancellationDeadlineHours: number,
): boolean {
  return startAt.getTime() - now.getTime() >= cancellationDeadlineHours * 60 * 60 * 1000
}

// ¿El nombre del residente a cargo no está vacío (ignorando espacios)?
export function isResidentInChargeNameValid(name: string): boolean {
  return name.trim().length > 0
}

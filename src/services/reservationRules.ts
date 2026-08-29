// Lógica de negocio de reservaciones que NO toca Firestore — funciones puras,
// fáciles de testear en aislamiento. `src/services/reservations.ts` las usa
// junto con las llamadas a Firestore; este archivo se mantiene libre de
// imports de `firebase/*` a propósito para que los tests no disparen la
// inicialización de la app (App Check, etc.).

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
// del usuario (status 'active'). Se usa para aplicar el límite de
// reservaciones activas por usuario (`maxActiveReservationsPerUser`).
export function countOccupyingReservations(reservations: { status: string }[]): number {
  return reservations.filter((r) => r.status === 'active').length
}

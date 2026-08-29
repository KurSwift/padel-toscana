// Copia deliberada del subconjunto de src/utils/time.ts que necesita
// createReservation (ver ./index.ts) — mismo motivo que reservationRules.ts:
// `firebase deploy --only functions` no puede importar ../src/.
export function toDate(dateStr: string, time: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  return new Date(year, month - 1, day, h, m)
}

export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  return `${String(h + hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

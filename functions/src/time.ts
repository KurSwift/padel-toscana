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

// Primer y último día de `month` (1-12) de `year`, como strings 'YYYY-MM-DD'
// — límites de la query por rango de getPublicCalendar (./index.ts,
// issue 8/8 del épico #60). `new Date(year, month, 0)` es el truco estándar
// para el último día del mes anterior a `month` (0-indexed + 1), que
// resuelve años bisiestos gratis sin tabla de días por mes.
export function monthDateRange(year: number, month: number): { firstDay: string; lastDay: string } {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDayNum = new Date(year, month, 0).getDate()
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`
  return { firstDay, lastDay }
}

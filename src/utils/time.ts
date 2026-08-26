const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  return `${String(h + hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatTime(time: string): string {
  const [h] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 || 12
  return `${display}:00 ${period}`
}

export function formatDateLong(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAYS[d.getDay()]}, ${day} de ${MONTHS[month - 1]}`
}

export function formatDateShort(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAYS[d.getDay()].slice(0, 3)} ${day} ${MONTHS[month - 1].slice(0, 3)}`
}

export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayString(): string {
  return toDateString(new Date())
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toDateString(date)
}

export function generateTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes: number,
): string[] {
  const slots: string[] = []
  const [closeH] = closeTime.split(':').map(Number)
  let [h] = openTime.split(':').map(Number)
  while (h < closeH) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    h += intervalMinutes / 60
  }
  return slots
}

export function getAvailableDurations(
  startTime: string,
  minDuration: number,
  maxDuration: number,
  closeTime: string,
  activeReservations: { startTime: string; endTime: string }[],
): number[] {
  const [closeH] = closeTime.split(':').map(Number)
  const [startH] = startTime.split(':').map(Number)
  const durations: number[] = []

  for (let d = minDuration; d <= maxDuration; d++) {
    if (startH + d > closeH) break
    const endTime = addHours(startTime, d)
    const conflicts = activeReservations.some(
      (r) => startTime < r.endTime && endTime > r.startTime,
    )
    if (conflicts) break
    durations.push(d)
  }
  return durations
}

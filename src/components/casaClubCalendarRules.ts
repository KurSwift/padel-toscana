/** Obtiene los límites inclusivos de un mes en el formato de fecha del modelo. */
export function getMonthDateRange(year: number, month: number): { firstDate: string; lastDate: string } {
  const firstDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  return { firstDate, lastDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
}

/** Indica si un día puede elegirse: debe estar en plazo y no tener una reservación ocupante. */
export function isDateSelectable(
  date: string,
  minDate: string,
  maxDate: string,
  occupiedDates: ReadonlySet<string>,
): boolean {
  return date >= minDate && date <= maxDate && !occupiedDates.has(date)
}

/** Comprueba si el mes adyacente comparte al menos un día con el rango reservable. */
export function canNavigateMonth(
  year: number,
  month: number,
  direction: -1 | 1,
  minDate: string,
  maxDate: string,
): boolean {
  const targetMonth = month + direction
  const targetYear = targetMonth === 0 ? year - 1 : targetMonth === 13 ? year + 1 : year
  const normalizedMonth = targetMonth === 0 ? 12 : targetMonth === 13 ? 1 : targetMonth
  const { firstDate, lastDate } = getMonthDateRange(targetYear, normalizedMonth)
  return lastDate >= minDate && firstDate <= maxDate
}

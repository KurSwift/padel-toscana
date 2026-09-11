import { describe, expect, it } from 'vitest'
import { canNavigateMonth, getMonthDateRange, isDateSelectable } from './casaClubCalendarRules'

describe('getMonthDateRange', () => {
  it('incluye todos los días de febrero en un año bisiesto', () => {
    expect(getMonthDateRange(2028, 2)).toEqual({ firstDate: '2028-02-01', lastDate: '2028-02-29' })
  })
})

describe('isDateSelectable', () => {
  it('permite solo fechas dentro del rango reservable que no están ocupadas', () => {
    expect(isDateSelectable('2026-09-12', '2026-09-11', '2026-12-10', new Set(['2026-09-14']))).toBe(true)
    expect(isDateSelectable('2026-09-10', '2026-09-11', '2026-12-10', new Set())).toBe(false)
    expect(isDateSelectable('2026-09-14', '2026-09-11', '2026-12-10', new Set(['2026-09-14']))).toBe(false)
  })
})

describe('canNavigateMonth', () => {
  it('evita navegar a un mes completamente fuera del rango reservable', () => {
    expect(canNavigateMonth(2026, 9, -1, '2026-09-11', '2026-12-10')).toBe(false)
    expect(canNavigateMonth(2026, 9, 1, '2026-09-11', '2026-12-10')).toBe(true)
    expect(canNavigateMonth(2026, 12, 1, '2026-09-11', '2026-12-10')).toBe(false)
  })
})

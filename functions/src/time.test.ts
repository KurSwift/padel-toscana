import { describe, it, expect } from 'vitest'
import { monthDateRange } from './time'

describe('monthDateRange', () => {
  it('calcula el rango de un mes de 31 días', () => {
    expect(monthDateRange(2026, 1)).toEqual({ firstDay: '2026-01-01', lastDay: '2026-01-31' })
  })

  it('calcula el rango de un mes de 30 días', () => {
    expect(monthDateRange(2026, 4)).toEqual({ firstDay: '2026-04-01', lastDay: '2026-04-30' })
  })

  it('calcula febrero en año no bisiesto', () => {
    expect(monthDateRange(2026, 2)).toEqual({ firstDay: '2026-02-01', lastDay: '2026-02-28' })
  })

  it('calcula febrero en año bisiesto', () => {
    expect(monthDateRange(2024, 2)).toEqual({ firstDay: '2024-02-01', lastDay: '2024-02-29' })
  })

  it('rellena con ceros mes de un dígito', () => {
    expect(monthDateRange(2026, 3).firstDay).toBe('2026-03-01')
  })
})

import { describe, expect, it } from 'vitest'
import { navigationForRole } from '@/services/navigationRules'

describe('navigationForRole', () => {
  it('muestra las secciones base a un colono', () => {
    expect(navigationForRole('colono').map((item) => item.destination)).toEqual([
      'calendar', 'reservations', 'help',
    ])
  })

  it('mantiene Pagos para admin porque conserva esa capacidad', () => {
    expect(navigationForRole('admin').map((item) => item.destination)).toEqual([
      'calendar', 'reservations', 'help', 'payments', 'settings',
    ])
  })

  it('muestra Pagos, pero no Configuración, a tesorero', () => {
    expect(navigationForRole('tesorero').map((item) => item.destination)).toEqual([
      'calendar', 'reservations', 'help', 'payments',
    ])
  })
})

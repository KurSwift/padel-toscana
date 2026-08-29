import { describe, it, expect } from 'vitest'
import {
  hasOverlap,
  countOccupyingReservations,
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  canTransition,
  computePaymentDueAt,
  effectiveStatus,
} from './reservationRules'

describe('hasOverlap', () => {
  it('devuelve false cuando no hay reservaciones existentes', () => {
    expect(hasOverlap([], '10:00', '11:00')).toBe(false)
  })

  it('devuelve false cuando el rango es adyacente (sin traslape)', () => {
    const existing = [{ startTime: '09:00', endTime: '10:00' }]
    expect(hasOverlap(existing, '10:00', '11:00')).toBe(false)
    expect(hasOverlap(existing, '08:00', '09:00')).toBe(false)
  })

  it('detecta traslape cuando el nuevo rango empieza dentro de uno existente', () => {
    const existing = [{ startTime: '09:00', endTime: '11:00' }]
    expect(hasOverlap(existing, '10:00', '12:00')).toBe(true)
  })

  it('detecta traslape cuando el nuevo rango termina dentro de uno existente', () => {
    const existing = [{ startTime: '10:00', endTime: '12:00' }]
    expect(hasOverlap(existing, '09:00', '11:00')).toBe(true)
  })

  it('detecta traslape cuando el nuevo rango envuelve completamente a uno existente', () => {
    const existing = [{ startTime: '10:00', endTime: '11:00' }]
    expect(hasOverlap(existing, '09:00', '12:00')).toBe(true)
  })

  it('detecta traslape cuando el nuevo rango está contenido en uno existente', () => {
    const existing = [{ startTime: '09:00', endTime: '12:00' }]
    expect(hasOverlap(existing, '10:00', '11:00')).toBe(true)
  })

  it('solo considera traslape contra la reservación relevante entre varias', () => {
    const existing = [
      { startTime: '08:00', endTime: '09:00' },
      { startTime: '14:00', endTime: '15:00' },
    ]
    expect(hasOverlap(existing, '10:00', '11:00')).toBe(false)
    expect(hasOverlap(existing, '08:30', '09:30')).toBe(true)
  })
})

describe('countOccupyingReservations', () => {
  it('devuelve 0 para una lista vacía', () => {
    expect(countOccupyingReservations([])).toBe(0)
  })

  it('cuenta solicitada y pagada como ocupando un cupo', () => {
    const reservations = [
      { status: 'solicitada' },
      { status: 'pagada' },
      { status: 'cancelada' },
      { status: 'finalizada' },
    ]
    expect(countOccupyingReservations(reservations)).toBe(2)
  })

  it('devuelve 0 cuando ninguna reservación ocupa un cupo (todas canceladas/finalizadas)', () => {
    const reservations = [{ status: 'cancelada' }, { status: 'finalizada' }]
    expect(countOccupyingReservations(reservations)).toBe(0)
  })
})

describe('isDurationWithinHardCap', () => {
  it('permite 1h y 2h', () => {
    expect(isDurationWithinHardCap(1)).toBe(true)
    expect(isDurationWithinHardCap(2)).toBe(true)
  })

  it('rechaza más de 2h, incluso si la cancha lo permitiría', () => {
    expect(isDurationWithinHardCap(3)).toBe(false)
  })
})

describe('isLeadTimeSufficient', () => {
  const now = new Date('2026-08-29T12:00:00')

  it('acepta un inicio exactamente a minLeadHours de distancia', () => {
    const startAt = new Date('2026-08-30T12:00:00') // +24h
    expect(isLeadTimeSufficient(startAt, now, 24)).toBe(true)
  })

  it('acepta un inicio con más anticipación de la mínima', () => {
    const startAt = new Date('2026-09-01T12:00:00')
    expect(isLeadTimeSufficient(startAt, now, 24)).toBe(true)
  })

  it('rechaza un inicio con menos anticipación de la mínima', () => {
    const startAt = new Date('2026-08-30T11:00:00') // +23h
    expect(isLeadTimeSufficient(startAt, now, 24)).toBe(false)
  })

  it('rechaza un inicio en el pasado', () => {
    const startAt = new Date('2026-08-29T10:00:00')
    expect(isLeadTimeSufficient(startAt, now, 24)).toBe(false)
  })
})

describe('isWithinMaxAdvanceWindow', () => {
  const now = new Date('2026-08-29T12:00:00')

  it('acepta un inicio dentro de la ventana máxima', () => {
    const startAt = new Date('2026-09-03T12:00:00') // +5 días
    expect(isWithinMaxAdvanceWindow(startAt, now, 7)).toBe(true)
  })

  it('acepta un inicio exactamente en el límite', () => {
    const startAt = new Date('2026-09-05T12:00:00') // +7 días
    expect(isWithinMaxAdvanceWindow(startAt, now, 7)).toBe(true)
  })

  it('rechaza un inicio más allá de la ventana máxima', () => {
    const startAt = new Date('2026-09-06T12:00:00') // +8 días
    expect(isWithinMaxAdvanceWindow(startAt, now, 7)).toBe(false)
  })
})

describe('canTransition', () => {
  it('admin puede hacer cualquier transición, incluso una sin sentido de negocio', () => {
    expect(canTransition({ role: 'admin', isOwner: false }, 'finalizada', 'solicitada')).toBe(true)
    expect(canTransition({ role: 'admin', isOwner: false }, 'solicitada', 'pagada')).toBe(true)
  })

  it('el dueño puede cancelar desde solicitada', () => {
    expect(canTransition({ role: 'colono', isOwner: true }, 'solicitada', 'cancelada')).toBe(true)
  })

  it('el dueño puede cancelar desde pagada', () => {
    expect(canTransition({ role: 'colono', isOwner: true }, 'pagada', 'cancelada')).toBe(true)
  })

  it('un colono que no es el dueño no puede cancelar', () => {
    expect(canTransition({ role: 'colono', isOwner: false }, 'solicitada', 'cancelada')).toBe(false)
  })

  it('el tesorero puede confirmar el pago (solicitada → pagada)', () => {
    expect(canTransition({ role: 'tesorero', isOwner: false }, 'solicitada', 'pagada')).toBe(true)
  })

  it('un colono, aunque sea el dueño, no puede confirmar su propio pago', () => {
    expect(canTransition({ role: 'colono', isOwner: true }, 'solicitada', 'pagada')).toBe(false)
  })

  it('el tesorero no puede cancelar una reservación que no es suya', () => {
    expect(canTransition({ role: 'tesorero', isOwner: false }, 'pagada', 'cancelada')).toBe(false)
  })

  it('nadie no-admin puede reabrir una reservación cancelada o finalizada', () => {
    expect(canTransition({ role: 'colono', isOwner: true }, 'cancelada', 'solicitada')).toBe(false)
    expect(canTransition({ role: 'tesorero', isOwner: false }, 'finalizada', 'pagada')).toBe(false)
  })

  it('no permite "transicionar" a un usuario no-admin al mismo estado', () => {
    expect(canTransition({ role: 'tesorero', isOwner: false }, 'pagada', 'pagada')).toBe(false)
  })
})

describe('computePaymentDueAt', () => {
  it('resta paymentDeadlineHours a startAt', () => {
    const startAt = new Date('2026-08-30T12:00:00')
    const dueAt = computePaymentDueAt(startAt, 12)
    expect(dueAt.getTime()).toBe(startAt.getTime() - 12 * 60 * 60 * 1000)
  })
})

describe('effectiveStatus', () => {
  // startAt (implícito) 2026-08-30T12:00:00, paymentDueAt 12h antes,
  // endAt 1h después — fixture compartida para los escenarios de tiempo.
  const paymentDueAt = new Date('2026-08-30T00:00:00') // startAt - 12h
  const endAt = new Date('2026-08-30T13:00:00')

  function reservation(status: 'solicitada' | 'pagada' | 'cancelada' | 'finalizada') {
    return { status, paymentDueAt, endAt }
  }

  it('solicitada, antes del deadline de pago → no cambia', () => {
    const now = new Date('2026-08-29T23:00:00') // -1h antes de paymentDueAt
    expect(effectiveStatus(reservation('solicitada'), now)).toBe('solicitada')
  })

  it('solicitada, exactamente en el deadline de pago → todavía no expira (comparación estricta)', () => {
    expect(effectiveStatus(reservation('solicitada'), paymentDueAt)).toBe('solicitada')
  })

  it('solicitada, justo después del deadline de pago → se libera (cancelada)', () => {
    const now = new Date(paymentDueAt.getTime() + 1000)
    expect(effectiveStatus(reservation('solicitada'), now)).toBe('cancelada')
  })

  it('solicitada, mucho después de endAt sin haberse pagado → sigue siendo cancelada, NO finalizada', () => {
    const now = new Date(endAt.getTime() + 60 * 60 * 1000) // +1h después de endAt
    expect(effectiveStatus(reservation('solicitada'), now)).toBe('cancelada')
  })

  it('pagada, antes de endAt → no cambia', () => {
    const now = new Date('2026-08-30T12:30:00')
    expect(effectiveStatus(reservation('pagada'), now)).toBe('pagada')
  })

  it('pagada, después del deadline de pago (irrelevante una vez pagada) pero antes de endAt → no cambia', () => {
    const now = new Date(paymentDueAt.getTime() + 60 * 60 * 1000) // pasó paymentDueAt, no endAt
    expect(effectiveStatus(reservation('pagada'), now)).toBe('pagada')
  })

  it('pagada, exactamente en endAt → todavía no finaliza (comparación estricta)', () => {
    expect(effectiveStatus(reservation('pagada'), endAt)).toBe('pagada')
  })

  it('pagada, justo después de endAt → finaliza', () => {
    const now = new Date(endAt.getTime() + 1000)
    expect(effectiveStatus(reservation('pagada'), now)).toBe('finalizada')
  })

  it('cancelada nunca cambia, sin importar cuánto tiempo pase', () => {
    const now = new Date(endAt.getTime() + 365 * 24 * 60 * 60 * 1000)
    expect(effectiveStatus(reservation('cancelada'), now)).toBe('cancelada')
  })

  it('finalizada nunca cambia, sin importar cuánto tiempo pase', () => {
    const now = new Date(endAt.getTime() + 365 * 24 * 60 * 60 * 1000)
    expect(effectiveStatus(reservation('finalizada'), now)).toBe('finalizada')
  })
})

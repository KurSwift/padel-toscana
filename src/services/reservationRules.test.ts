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
  isPlayerCountValid,
  isResidentInChargeNameValid,
  isWithinMonthlyLimit,
  isCancellationAllowed,
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

  it('super-admin puede hacer cualquier transición, igual que admin', () => {
    expect(canTransition({ role: 'super-admin', isOwner: false }, 'finalizada', 'solicitada')).toBe(true)
    expect(canTransition({ role: 'super-admin', isOwner: false }, 'solicitada', 'pagada')).toBe(true)
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

describe('isPlayerCountValid', () => {
  it('acepta el rango 1–10', () => {
    expect(isPlayerCountValid(1)).toBe(true)
    expect(isPlayerCountValid(4)).toBe(true)
    expect(isPlayerCountValid(10)).toBe(true)
  })

  it('rechaza 0 y valores negativos', () => {
    expect(isPlayerCountValid(0)).toBe(false)
    expect(isPlayerCountValid(-1)).toBe(false)
  })

  it('rechaza más de 10', () => {
    expect(isPlayerCountValid(11)).toBe(false)
  })

  it('rechaza valores no enteros', () => {
    expect(isPlayerCountValid(2.5)).toBe(false)
  })

  it('acepta un máximo distinto al default (casa club, hasta 30)', () => {
    expect(isPlayerCountValid(30, 30)).toBe(true)
    expect(isPlayerCountValid(11, 30)).toBe(true)
  })

  it('rechaza por encima del máximo pasado explícitamente', () => {
    expect(isPlayerCountValid(31, 30)).toBe(false)
  })
})

describe('isWithinMonthlyLimit', () => {
  const now = new Date('2026-09-15T12:00:00')

  function reservation(status: string, startAt: Date) {
    return { status, startAt }
  }

  it('dentro del tope: menos reservaciones del mes que el máximo', () => {
    const reservations = [reservation('pagada', new Date('2026-09-01T10:00:00'))]
    expect(isWithinMonthlyLimit(reservations, 2, now)).toBe(true)
  })

  it('en el tope: ya tiene exactamente el máximo, bloquea una nueva', () => {
    const reservations = [
      reservation('pagada', new Date('2026-09-01T10:00:00')),
      reservation('solicitada', new Date('2026-09-10T10:00:00')),
    ]
    expect(isWithinMonthlyLimit(reservations, 2, now)).toBe(false)
  })

  it('se reinicia entre meses: reservaciones de meses anteriores no cuentan', () => {
    const reservations = [
      reservation('pagada', new Date('2026-08-01T10:00:00')),
      reservation('pagada', new Date('2026-08-15T10:00:00')),
    ]
    expect(isWithinMonthlyLimit(reservations, 2, now)).toBe(true)
  })

  it('ignora reservaciones canceladas o finalizadas del mismo mes', () => {
    const reservations = [
      reservation('cancelada', new Date('2026-09-01T10:00:00')),
      reservation('finalizada', new Date('2026-09-10T10:00:00')),
    ]
    expect(isWithinMonthlyLimit(reservations, 2, now)).toBe(true)
  })
})

describe('isCancellationAllowed', () => {
  const now = new Date('2026-09-15T12:00:00')

  it('permite cancelar justo en el límite del plazo', () => {
    const startAt = new Date('2026-09-17T12:00:00') // +48h
    expect(isCancellationAllowed(startAt, now, 48)).toBe(true)
  })

  it('permite cancelar con más anticipación de la mínima', () => {
    const startAt = new Date('2026-09-20T12:00:00')
    expect(isCancellationAllowed(startAt, now, 48)).toBe(true)
  })

  it('rechaza cancelar con menos anticipación de la mínima', () => {
    const startAt = new Date('2026-09-17T11:00:00') // +47h
    expect(isCancellationAllowed(startAt, now, 48)).toBe(false)
  })
})

describe('isResidentInChargeNameValid', () => {
  it('acepta un nombre no vacío', () => {
    expect(isResidentInChargeNameValid('Ana Activa')).toBe(true)
  })

  it('rechaza una cadena vacía', () => {
    expect(isResidentInChargeNameValid('')).toBe(false)
  })

  it('rechaza una cadena de solo espacios', () => {
    expect(isResidentInChargeNameValid('   ')).toBe(false)
  })
})

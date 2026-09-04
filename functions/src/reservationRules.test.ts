// Mismos casos que src/services/reservationRules.test.ts para las reglas
// que también viven acá — mantenerlos en sync si se agrega un caso allá
// para una regla duplicada en este archivo. Ver comentario de cabecera en
// ./reservationRules.ts.
import { describe, it, expect } from 'vitest'
import {
  hasOverlap,
  countOccupyingReservations,
  isDurationWithinHardCap,
  isLeadTimeSufficient,
  isWithinMaxAdvanceWindow,
  computePaymentDueAt,
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

describe('computePaymentDueAt', () => {
  it('resta paymentDeadlineHours a startAt', () => {
    const startAt = new Date('2026-08-30T12:00:00')
    const dueAt = computePaymentDueAt(startAt, 12)
    expect(dueAt.getTime()).toBe(startAt.getTime() - 12 * 60 * 60 * 1000)
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

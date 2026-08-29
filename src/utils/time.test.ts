import { describe, it, expect } from 'vitest'
import {
  addHours,
  formatTime,
  formatDateLong,
  formatDateShort,
  toDateString,
  todayString,
  addDays,
  generateTimeSlots,
  getAvailableDurations,
  toDate,
  toTimeString,
  formatDateTimeShort,
} from './time'

describe('addHours', () => {
  it('suma horas dentro del mismo día', () => {
    expect(addHours('09:00', 2)).toBe('11:00')
  })

  it('conserva los minutos', () => {
    expect(addHours('09:30', 1)).toBe('10:30')
  })
})

describe('formatTime', () => {
  it('formatea horas AM', () => {
    expect(formatTime('09:00')).toBe('9:00 AM')
  })

  it('formatea horas PM', () => {
    expect(formatTime('14:00')).toBe('2:00 PM')
  })

  it('formatea medianoche como 12 AM', () => {
    expect(formatTime('00:00')).toBe('12:00 AM')
  })

  it('formatea mediodía como 12 PM', () => {
    expect(formatTime('12:00')).toBe('12:00 PM')
  })
})

describe('formatDateLong / formatDateShort', () => {
  it('formatDateLong incluye día de la semana y mes en español', () => {
    // 2026-08-29 es sábado
    expect(formatDateLong('2026-08-29')).toBe('Sábado, 29 de agosto')
  })

  it('formatDateShort usa versiones abreviadas', () => {
    expect(formatDateShort('2026-08-29')).toBe('Sáb 29 ago')
  })
})

describe('toDateString / todayString', () => {
  it('toDateString convierte un Date a YYYY-MM-DD', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('todayString devuelve la fecha de hoy en formato YYYY-MM-DD', () => {
    expect(todayString()).toBe(toDateString(new Date()))
  })
})

describe('addDays', () => {
  it('suma días dentro del mismo mes', () => {
    expect(addDays('2026-08-01', 5)).toBe('2026-08-06')
  })

  it('cruza el límite de mes correctamente', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02')
  })

  it('acepta días negativos', () => {
    expect(addDays('2026-08-05', -1)).toBe('2026-08-04')
  })
})

describe('generateTimeSlots', () => {
  it('genera slots por hora entre open y close', () => {
    expect(generateTimeSlots('08:00', '11:00', 60)).toEqual(['08:00', '09:00', '10:00'])
  })

  it('devuelve arreglo vacío cuando open === close', () => {
    expect(generateTimeSlots('08:00', '08:00', 60)).toEqual([])
  })
})

describe('toDate', () => {
  it('combina fecha y hora en un Date de hora local', () => {
    const d = toDate('2026-08-29', '14:30')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(29)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
  })

  it('produce un Date distinto para horas distintas del mismo día', () => {
    const a = toDate('2026-08-29', '09:00')
    const b = toDate('2026-08-29', '10:00')
    expect(b.getTime() - a.getTime()).toBe(60 * 60 * 1000)
  })
})

describe('toTimeString', () => {
  it('convierte un Date a HH:mm con padding', () => {
    expect(toTimeString(new Date(2026, 7, 29, 9, 5))).toBe('09:05')
  })

  it('es el inverso de toDate para la parte de hora', () => {
    const d = toDate('2026-08-29', '22:00')
    expect(toTimeString(d)).toBe('22:00')
  })
})

describe('formatDateTimeShort', () => {
  it('combina fecha y hora en un solo string', () => {
    // 2026-08-29 es sábado
    expect(formatDateTimeShort(new Date(2026, 7, 29, 22, 0))).toBe('Sáb 29 ago · 10:00 PM')
  })
})

describe('getAvailableDurations', () => {
  it('devuelve todas las duraciones posibles cuando no hay conflictos', () => {
    expect(getAvailableDurations('09:00', 1, 3, '13:00', [])).toEqual([1, 2, 3])
  })

  it('se detiene antes del cierre de la cancha', () => {
    expect(getAvailableDurations('11:00', 1, 3, '13:00', [])).toEqual([1, 2])
  })

  it('se detiene en la primera duración que choca con una reservación existente', () => {
    const existing = [{ startTime: '11:00', endTime: '12:00' }]
    expect(getAvailableDurations('09:00', 1, 4, '15:00', existing)).toEqual([1, 2])
  })

  it('devuelve arreglo vacío si ni la duración mínima cabe', () => {
    expect(getAvailableDurations('12:00', 2, 3, '13:00', [])).toEqual([])
  })
})

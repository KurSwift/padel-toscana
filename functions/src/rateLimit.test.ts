import { describe, it, expect } from 'vitest'
import {
  checkRateLimit,
  LOOKUP_RATE_LIMIT_MAX_CALLS,
  LOOKUP_RATE_LIMIT_WINDOW_MS,
  lookupRateLimitKey,
} from './rateLimit'

const WINDOW_MS = 5 * 60 * 1000
const MAX_CALLS = 10

describe('checkRateLimit', () => {
  it('permite la primera llamada de un uid (sin estado previo)', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const result = checkRateLimit(null, now, WINDOW_MS, MAX_CALLS)
    expect(result.allowed).toBe(true)
    expect(result.nextState).toEqual({ windowStart: now, count: 1 })
  })

  it('cuenta llamadas dentro de la misma ventana', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T00:02:00Z')
    const result = checkRateLimit({ windowStart, count: 3 }, now, WINDOW_MS, MAX_CALLS)
    expect(result.allowed).toBe(true)
    expect(result.nextState).toEqual({ windowStart, count: 4 })
  })

  it('bloquea al llegar al máximo dentro de la ventana', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-01T00:04:00Z')
    const result = checkRateLimit({ windowStart, count: MAX_CALLS }, now, WINDOW_MS, MAX_CALLS)
    expect(result.allowed).toBe(false)
    // El estado no avanza — no se le regala una llamada extra al que ya
    // llegó al tope.
    expect(result.nextState).toEqual({ windowStart, count: MAX_CALLS })
  })

  it('arranca una ventana nueva una vez que expira la anterior, incluso si estaba al tope', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date(windowStart.getTime() + WINDOW_MS)
    const result = checkRateLimit({ windowStart, count: MAX_CALLS }, now, WINDOW_MS, MAX_CALLS)
    expect(result.allowed).toBe(true)
    expect(result.nextState).toEqual({ windowStart: now, count: 1 })
  })

  it('justo un milisegundo antes de que expire la ventana sigue contando contra el tope', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date(windowStart.getTime() + WINDOW_MS - 1)
    const result = checkRateLimit({ windowStart, count: MAX_CALLS }, now, WINDOW_MS, MAX_CALLS)
    expect(result.allowed).toBe(false)
  })
})

describe('límite de consultas de domicilio', () => {
  it('limita una IP a 10 consultas en cinco minutos', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    let state = null
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = checkRateLimit(state, start, LOOKUP_RATE_LIMIT_WINDOW_MS, LOOKUP_RATE_LIMIT_MAX_CALLS)
      expect(result.allowed).toBe(true)
      state = result.nextState
    }

    expect(checkRateLimit(state, start, LOOKUP_RATE_LIMIT_WINDOW_MS, LOOKUP_RATE_LIMIT_MAX_CALLS).allowed).toBe(false)
  })

  it('deriva una llave estable sin guardar la IP cruda como id', () => {
    expect(lookupRateLimitKey('::ffff:192.0.2.1')).toBe('45798dfb67fb594ead7bbac78cbe6ab25e46bc0e86f0f683af32cc0a318566c3')
  })
})

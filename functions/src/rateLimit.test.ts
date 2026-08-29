import { describe, it, expect } from 'vitest'
import { checkRateLimit } from './rateLimit'

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

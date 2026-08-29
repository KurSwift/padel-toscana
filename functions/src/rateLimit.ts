// Rate limiting explícito para createReservation — ver tarea 3 en TASKS.md
// (prevenir abuso de la API en plan Blaze). Firebase no trae esto nativo en
// callable functions. Ventana fija por uid, guardada en rateLimits/{uid}
// (ver index.ts para el wiring con Firestore; esto es solo la decisión pura,
// testeable sin tocar la base de datos).

export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
export const RATE_LIMIT_MAX_CALLS = 10

export interface RateLimitState {
  windowStart: Date
  count: number
}

export interface RateLimitResult {
  allowed: boolean
  nextState: RateLimitState
}

// ¿Puede este uid hacer una llamada más? `state` es null si nunca ha
// llamado. Si `now` cayó fuera de la ventana de `state`, arranca una
// ventana nueva (fixed window, no sliding) — más simple y suficiente para
// el volumen real del proyecto.
export function checkRateLimit(
  state: RateLimitState | null,
  now: Date,
  windowMs: number,
  maxCalls: number,
): RateLimitResult {
  const windowExpired = state === null || now.getTime() - state.windowStart.getTime() >= windowMs

  if (windowExpired) {
    return { allowed: true, nextState: { windowStart: now, count: 1 } }
  }
  if (state.count >= maxCalls) {
    return { allowed: false, nextState: state }
  }
  return { allowed: true, nextState: { windowStart: state.windowStart, count: state.count + 1 } }
}

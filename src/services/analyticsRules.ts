// Contrato puro de Analytics: limita eventos y parámetros a categorías
// agregadas. Es la barrera para que los flujos de UI no envíen PII por error.

export const ANALYTICS_EVENT_NAMES = [
  'login_started',
  'otp_sent',
  'login_completed',
  'login_failed',
  'resource_selected',
  'reservation_started',
  'reservation_created',
  'reservation_failed',
  'reservation_cancelled',
  'payment_confirmed',
  'public_calendar_viewed',
] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number]

export interface AnalyticsParams {
  resource_type?: 'cancha' | 'casa_club'
  role?: 'anonymous' | 'colono' | 'admin' | 'tesorero' | 'super_admin'
  result?: 'success' | 'error'
  stage?: 'address' | 'otp' | 'booking' | 'payment'
  error_code?: AnalyticsErrorCode
}

const ERROR_CODES = [
  'address-not-found',
  'account-not-found',
  'invalid-phone',
  'otp-failed',
  'rate-limited',
  'slot-taken',
  'max-reservations',
  'monthly-limit',
  'lead-time-too-short',
  'too-far-ahead',
  'booking-unavailable',
] as const

type AnalyticsErrorCode = (typeof ERROR_CODES)[number]

/** Determina si un nombre pertenece al catálogo de eventos aprobado. */
export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
}

// Los códigos de error de Firebase Auth (`err.code`, ej.
// 'auth/invalid-phone-number') son específicos de la SDK, no del catálogo de
// negocio que ya usan reservationErrorMessage/adminCreateColonoErrorMessage.
// Este mapa traduce solo los que tienen equivalente categórico aprobado —
// el resto queda sin error_code (login_failed se registra igual, solo sin
// ese detalle) en vez de inventar una categoría nueva por cada código de Auth.
const AUTH_ERROR_CODE_MAP: Record<string, AnalyticsErrorCode> = {
  'auth/invalid-phone-number': 'invalid-phone',
  'auth/too-many-requests': 'rate-limited',
  'auth/invalid-verification-code': 'otp-failed',
  'auth/code-expired': 'otp-failed',
}

/** Traduce un código de error de Firebase Auth al catálogo de Analytics, si aplica. */
export function authErrorToAnalyticsCode(code: string): AnalyticsErrorCode | undefined {
  return AUTH_ERROR_CODE_MAP[code]
}

/** Conserva exclusivamente parámetros categóricos aprobados para Analytics. */
export function sanitizeAnalyticsParams(input: Record<string, unknown>): AnalyticsParams {
  const params: AnalyticsParams = {}
  if (input.resource_type === 'cancha') params.resource_type = 'cancha'
  if (input.resource_type === 'casa-club' || input.resource_type === 'casa_club') params.resource_type = 'casa_club'
  if (input.role === 'anonymous' || input.role === 'colono' || input.role === 'admin' || input.role === 'tesorero') {
    params.role = input.role
  }
  if (input.role === 'super-admin' || input.role === 'super_admin') params.role = 'super_admin'
  if (input.result === 'success' || input.result === 'error') params.result = input.result
  if (input.stage === 'address' || input.stage === 'otp' || input.stage === 'booking' || input.stage === 'payment') {
    params.stage = input.stage
  }
  if ((ERROR_CODES as readonly string[]).includes(input.error_code as string)) {
    params.error_code = input.error_code as AnalyticsErrorCode
  }
  return params
}

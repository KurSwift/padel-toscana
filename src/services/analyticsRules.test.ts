import { describe, expect, it } from 'vitest'
import { authErrorToAnalyticsCode, isAnalyticsEventName, sanitizeAnalyticsParams } from './analyticsRules'

describe('isAnalyticsEventName', () => {
  it('acepta únicamente eventos definidos por el producto', () => {
    expect(isAnalyticsEventName('reservation_created')).toBe(true)
    expect(isAnalyticsEventName('phone_submitted')).toBe(false)
  })
})

describe('sanitizeAnalyticsParams', () => {
  it('conserva solo categorías agregadas permitidas', () => {
    expect(sanitizeAnalyticsParams({
      resource_type: 'casa-club',
      role: 'colono',
      result: 'success',
      phone: '+525512345678',
      address: 'Nogal 35',
      reservation_id: 'abc123',
    })).toEqual({ resource_type: 'casa_club', role: 'colono', result: 'success' })
  })

  it('descarta valores fuera del catálogo para no enviar texto libre', () => {
    expect(sanitizeAnalyticsParams({ role: 'María García', result: 'todo salió bien', error_code: '5501234567' })).toEqual({})
  })
})

describe('authErrorToAnalyticsCode', () => {
  it('traduce códigos de Firebase Auth con equivalente categórico', () => {
    expect(authErrorToAnalyticsCode('auth/invalid-phone-number')).toBe('invalid-phone')
    expect(authErrorToAnalyticsCode('auth/too-many-requests')).toBe('rate-limited')
    expect(authErrorToAnalyticsCode('auth/invalid-verification-code')).toBe('otp-failed')
    expect(authErrorToAnalyticsCode('auth/code-expired')).toBe('otp-failed')
  })

  it('no inventa una categoría para códigos sin equivalente aprobado', () => {
    expect(authErrorToAnalyticsCode('auth/popup-closed-by-user')).toBeUndefined()
  })
})

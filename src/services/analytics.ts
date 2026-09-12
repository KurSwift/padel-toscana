import { logEvent } from 'firebase/analytics'
import { analytics } from '@/firebase'
import { type AnalyticsEventName, type AnalyticsParams, sanitizeAnalyticsParams } from '@/services/analyticsRules'

/**
 * Registra un evento aprobado cuando Analytics está disponible. Las métricas
 * nunca bloquean la UX: en emuladores, tests o navegadores no compatibles no
 * hace nada, y sus parámetros se reducen al contrato sin PII.
 */
export function trackAnalyticsEvent(
  name: AnalyticsEventName,
  params: Record<string, unknown> = {},
): void {
  if (!analytics) return
  const safeParams: AnalyticsParams = sanitizeAnalyticsParams(params)
  logEvent(analytics, name, safeParams)
}

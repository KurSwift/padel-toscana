import { UserRole } from '@/types'

export type AppDestination = 'calendar' | 'reservations' | 'help' | 'payments' | 'settings'

export interface AppNavigationItem {
  destination: AppDestination
  label: string
  path: string
}

const ITEMS: Record<AppDestination, AppNavigationItem> = {
  calendar: { destination: 'calendar', label: 'Calendario', path: '/' },
  reservations: { destination: 'reservations', label: 'Reservaciones', path: '/reservaciones' },
  help: { destination: 'help', label: 'Ayuda', path: '/ayuda' },
  payments: { destination: 'payments', label: 'Pagos', path: '/pagos' },
  settings: { destination: 'settings', label: 'Configuración', path: '/configuracion' },
}

/**
 * Devuelve las secciones de navegación que el rol puede usar en la app
 * autenticada. Mantiene la visibilidad alineada con las rutas protegidas.
 */
export function navigationForRole(role: UserRole | undefined): AppNavigationItem[] {
  const items = [ITEMS.calendar, ITEMS.reservations, ITEMS.help]

  // Admin conserva la capacidad vigente de confirmar pagos; no se oculta una
  // función que ya está autorizada por firestore.rules.
  if (role === 'tesorero' || role === 'admin' || role === 'super-admin') {
    items.push(ITEMS.payments)
  }
  if (role === 'admin' || role === 'super-admin') {
    items.push(ITEMS.settings)
  }

  return items
}

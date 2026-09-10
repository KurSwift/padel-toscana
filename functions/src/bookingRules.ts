// Espejo de src/services/bookingRules.ts; mantener reglas y tests sincronizados.
/** Perfil mínimo leído del servidor para autorizar la creación de reservaciones. */
interface BookingUser {
  role?: string
  status?: string
}

/** Indica si un perfil puede usar la creación administrativa para colonos. */
export function canBookForResident(user: BookingUser | null | undefined): boolean {
  return user?.status === 'active' && (user.role === 'admin' || user.role === 'super-admin')
}

/** Solo los colonos activos aparecen como beneficiarios de una reserva administrativa. */
export function isBookingResident(user: BookingUser | null | undefined): boolean {
  return user?.status === 'active' && user.role === 'colono'
}

/** Valida el uid opcional antes de usarlo como id de documento; undefined conserva la reserva propia. */
export function isValidBookingTarget(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0 &&
    value.length <= 128 && !value.includes('/') && value !== '.' && value !== '..')
}

/** Devuelve el código de rechazo o null; target explícito siempre requiere permisos administrativos. */
export function bookingPermissionError(
  actor: BookingUser | null,
  targetUserId: string | undefined,
  target: BookingUser | null,
): string | null {
  if (!actor) return 'user-not-found'
  if (actor.status !== 'active') return 'inactive-user'
  if (targetUserId === undefined) return null
  if (!canBookForResident(actor)) return 'admin-only'
  if (!target) return 'resident-not-found'
  if (!isBookingResident(target)) return 'invalid-resident'
  return null
}

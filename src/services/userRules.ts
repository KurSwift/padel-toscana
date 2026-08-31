// Lógica de negocio de roles/permisos que NO toca Firestore — funciones
// puras, testeadas con Vitest sin inicializar Firebase/App Check. Ver
// src/services/reservationRules.ts para el mismo patrón.
import { UserRole } from '@/types'

// Un usuario nunca puede cambiar su propio rol, ni siquiera si es admin —
// evita que un admin se auto-degrade por error, o se auto-promueva/quite
// permisos de forma accidental. Espejo del check que ya existía en
// AdminPage antes de la migración de isAdmin a role.
export function canChangeRole(actorUid: string, targetUid: string): boolean {
  return actorUid !== targetUid
}

// Determina si `role` satisface una lista de roles permitidos para una
// ruta protegida. Sin `allowedRoles` (undefined), cualquier rol autenticado
// pasa — usado por ProtectedRoute cuando solo se requiere estar logueado y
// aprobado, sin restricción de rol.
export function hasAllowedRole(role: UserRole | undefined, allowedRoles?: UserRole[]): boolean {
  if (!allowedRoles) return true
  return role !== undefined && allowedRoles.includes(role)
}

// Asignar rol a otro usuario es exclusivo de super-admin (Epic #43) — ni
// siquiera admin puede hacerlo, a diferencia del resto de las capacidades
// del panel admin, donde super-admin es un superset de admin.
export function canAssignRole(actorRole: UserRole): boolean {
  return actorRole === 'super-admin'
}

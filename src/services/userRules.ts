// Lógica de negocio de roles/permisos que NO toca Firestore — funciones
// puras, testeadas con Vitest sin inicializar Firebase/App Check. Ver
// src/services/reservationRules.ts para el mismo patrón.
import { UserRole } from '@/types'

// Un usuario nunca puede actuar sobre sí mismo en acciones sensibles de
// cuenta — cambiar su propio rol o eliminar su propia cuenta —, ni siquiera
// si es super-admin. Evita que un admin se auto-degrade por error, se
// auto-promueva/quite permisos de forma accidental, o (para eliminar) deje
// el sitio sin ningún super-admin, ya que no hay UI para asignar el rol de
// vuelta. Espejo del check que ya existía en AdminPage antes de la
// migración de isAdmin a role; ver también adminDeleteColono en
// functions/src/index.ts (misma regla, copiada ahí porque functions/ no
// importa de src/).
export function canActOnUser(actorUid: string, targetUid: string): boolean {
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

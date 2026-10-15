// Lógica pura para adminCreateColono/getResidentsByAddress (ver
// functions/src/index.ts) — a diferencia de reservationRules.ts, esto NO es
// un mirror de un archivo que ya existía del lado del cliente. Es la
// primera vez que estas reglas (calle válida, cupo de domicilio) se validan
// server-side; antes solo vivían en src/types/index.ts (VALID_STREETS) y
// src/services/users.ts (MAX_USERS_PER_ADDRESS, privado ahí).

export const VALID_STREETS = ['Nogal', 'Olivo', 'Encino'] as const
export type ValidStreet = (typeof VALID_STREETS)[number]

export function isValidStreet(street: string): street is ValidStreet {
  return (VALID_STREETS as readonly string[]).includes(street)
}

export const MAX_USERS_PER_ADDRESS = 2

// ¿Cabe un colono más en este domicilio?
export function isAddressAvailable(uids: string[]): boolean {
  return uids.length < MAX_USERS_PER_ADDRESS
}

// Debe calcular exactamente igual que el addressKey que ya usan
// checkAddressAvailability/registerUser en src/services/users.ts — ambos
// caminos escriben/leen el mismo addresses/{key}.
export function normalizeAddress(street: string, streetNumber: string): string {
  return `${street} ${streetNumber.trim()}`.toLowerCase()
}

// Espejo del check en RegisterPage.tsx (trimmedName.length < 2).
export function isValidColonoName(name: string): boolean {
  return name.trim().length >= 2
}

// +52 seguido de exactamente 10 dígitos.
export function isValidMxPhone(phone: string): boolean {
  return /^\+52\d{10}$/.test(phone)
}

// Normaliza (trim + minúsculas) y valida que sea una cuenta @gmail.com — el
// único dominio aceptado para entrar con Google (ver linkGoogleAccount en
// index.ts). Devuelve null si no es válido. No quita puntos: Google los
// ignora, pero aquí se compara literal, así que el admin captura el correo
// tal como lo usa el colono. Espejo en src/services/userRules.ts.
export function normalizeGmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  return /^[a-z0-9._%+-]+@gmail\.com$/.test(normalized) ? normalized : null
}

// Subconjunto de request.auth.token que importa para vincular Google.
export interface GoogleLinkToken {
  email?: string
  email_verified?: boolean
  firebase: { sign_in_provider: string }
}

// Gmail normalizado de un login de Google con correo verificado por Google,
// o null si el token no sirve para vincular (otro proveedor, sin verificar,
// o un dominio distinto de gmail.com).
export function googleLinkEmail(token: GoogleLinkToken): string | null {
  if (token.firebase.sign_in_provider !== 'google.com' || token.email_verified !== true || !token.email) return null
  return normalizeGmail(token.email)
}

export type GoogleLinkTarget = { ok: true; uid: string } | { ok: false; code: 'gmail-not-found' | 'gmail-ambiguous' }

// Dado los perfiles con ese gmail, decide a qué cuenta vincular Google: debe
// haber exactamente un colono activo (status ausente = activo, usuarios
// antiguos). Dos activos con el mismo correo es ambiguo — se rechaza en vez
// de adivinar, porque vincular a la cuenta equivocada le daría acceso a otra
// persona.
export function pickGoogleLinkTarget(profiles: { uid: string; status?: string }[]): GoogleLinkTarget {
  const active = profiles.filter((p) => (p.status ?? 'active') === 'active')
  if (active.length === 0) return { ok: false, code: 'gmail-not-found' }
  if (active.length > 1) return { ok: false, code: 'gmail-ambiguous' }
  return { ok: true, uid: active[0].uid }
}

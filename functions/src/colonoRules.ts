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

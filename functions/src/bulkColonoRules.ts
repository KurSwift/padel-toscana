import { isValidColonoName, isValidMxPhone, normalizeAddress, VALID_STREETS, type ValidStreet } from './colonoRules'

export const MAX_BULK_COLONOS = 100

export interface BulkColonoInput {
  calle: unknown
  numero_casa: unknown
  nombre_completo: unknown
  telefono: unknown
  email?: unknown
}

export interface ValidBulkColono {
  street: ValidStreet
  streetNumber: string
  name: string
  phone: string
  email: string | null
  addressKey: string
}

/** Normaliza los teléfonos del JSON al formato que Firebase Auth acepta. */
export function normalizeBulkMxPhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  const localNumber = digits.length === 12 && digits.startsWith('52') ? digits.slice(2) : digits
  const phone = `+52${localNumber}`
  return isValidMxPhone(phone) ? phone : null
}

/** Conserva la tolerancia a mayúsculas del script preregister-colonos.mjs. */
function normalizeBulkStreet(value: unknown): ValidStreet | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return VALID_STREETS.find((street) => street.toLowerCase() === normalized) ?? null
}

/** Valida y normaliza una fila de carga masiva sin hacer lecturas ni escrituras. */
export function validateBulkColono(row: unknown):
  | { ok: true; colono: ValidBulkColono }
  | { ok: false; reason: string } {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return { ok: false, reason: 'La fila no es un objeto válido.' }
  }
  const value = row as BulkColonoInput
  const street = normalizeBulkStreet(value.calle)
  if (!street) return { ok: false, reason: 'La calle no es válida.' }
  const streetNumber = String(value.numero_casa ?? '').trim()
  if (!streetNumber) return { ok: false, reason: 'Falta el número de casa.' }
  const name = String(value.nombre_completo ?? '').trim()
  if (!isValidColonoName(name)) return { ok: false, reason: 'El nombre completo no es válido.' }
  const phone = normalizeBulkMxPhone(value.telefono)
  if (!phone) return { ok: false, reason: 'El teléfono debe tener 10 dígitos.' }
  if (value.email !== undefined && typeof value.email !== 'string') {
    return { ok: false, reason: 'El correo debe ser texto.' }
  }
  const email = value.email?.trim() || null
  return { ok: true, colono: { street, streetNumber, name, phone, email, addressKey: normalizeAddress(street, streetNumber) } }
}

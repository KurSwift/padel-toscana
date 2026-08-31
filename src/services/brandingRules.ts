// Validación pura del archivo de logo antes de subirlo — espejo de la
// validación equivalente en storage.rules (allow write de branding/logo,
// que también chequea contentType y size). Si cambia una, hay que
// actualizar la otra (ver AGENTS.md).
export const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024

export const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const

export function isValidLogoFile(file: { type: string; size: number }): boolean {
  return (
    (ALLOWED_LOGO_TYPES as readonly string[]).includes(file.type) &&
    file.size > 0 &&
    file.size <= MAX_LOGO_SIZE_BYTES
  )
}

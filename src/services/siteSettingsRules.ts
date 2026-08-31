// Validación pura de la configuración general del sitio (nombre + link de
// contacto de WhatsApp) — mismo patrón que brandingRules.ts. No se duplica
// en firestore.rules: settings/{docId} ya está gateado a isSuperAdmin()
// para escritura, y esto es solo texto de display sin consecuencias de
// seguridad (mismo criterio que courts, que tampoco valida campos en
// rules — ver AGENTS.md).
export const MAX_SITE_NAME_LENGTH = 60

export function isValidSiteName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_SITE_NAME_LENGTH
}

// Vacío es válido — el link de WhatsApp es opcional, sin él HelpPage cae al
// texto plano de siempre (ver src/pages/HelpPage.tsx). Si se llena, debe
// ser uno de los dos formatos reales de link de WhatsApp (chat directo o
// invitación a grupo).
export function isValidWhatsappUrl(url: string): boolean {
  const trimmed = url.trim()
  if (trimmed === '') return true
  return /^https:\/\/(wa\.me\/|chat\.whatsapp\.com\/)/.test(trimmed)
}

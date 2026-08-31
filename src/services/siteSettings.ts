import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { isValidSiteName, isValidWhatsappUrl } from './siteSettingsRules'

// Solo super-admin (reforzado en firestore.rules — settings/{docId} ya
// está gateado a isSuperAdmin() para escritura, ver #42).
export async function updateSiteSettings(data: {
  siteName: string
  whatsappUrl: string
}): Promise<void> {
  if (!isValidSiteName(data.siteName)) throw new Error('invalid-site-name')
  if (!isValidWhatsappUrl(data.whatsappUrl)) throw new Error('invalid-whatsapp-url')
  await setDoc(doc(db, 'settings', 'general'), {
    siteName: data.siteName.trim(),
    whatsappUrl: data.whatsappUrl.trim(),
  })
}

const UPDATE_SITE_SETTINGS_ERRORS: Record<string, string> = {
  'invalid-site-name': 'Ingresa un nombre de sitio válido (máximo 60 caracteres).',
  'invalid-whatsapp-url': 'El link de WhatsApp debe empezar con https://wa.me/ o https://chat.whatsapp.com/.',
}

export function updateSiteSettingsErrorMessage(code: string): string {
  return UPDATE_SITE_SETTINGS_ERRORS[code] ?? 'No se pudo guardar. Intenta de nuevo.'
}

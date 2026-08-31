import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/firebase'
import { isValidLogoFile } from './brandingRules'

// Ruta fija (ver storage.rules) — el resto de la app no necesita guardar
// ninguna URL, siempre pide este mismo objeto.
const LOGO_PATH = 'branding/logo'

// Solo super-admin (reforzado en storage.rules, no aquí).
export async function uploadLogo(file: File): Promise<string> {
  if (!isValidLogoFile(file)) {
    throw new Error('invalid-file')
  }
  const logoRef = ref(storage, LOGO_PATH)
  await uploadBytes(logoRef, file, { contentType: file.type })
  return getDownloadURL(logoRef)
}

// null si nadie ha subido un logo todavía — quien llame cae al fallback
// (el badge "P", ver src/components/Logo.tsx).
export async function getLogoUrl(): Promise<string | null> {
  try {
    return await getDownloadURL(ref(storage, LOGO_PATH))
  } catch (err) {
    if ((err as { code?: string }).code === 'storage/object-not-found') return null
    throw err
  }
}

const UPLOAD_LOGO_ERRORS: Record<string, string> = {
  'invalid-file': 'Formato no soportado o archivo demasiado grande (máximo 5MB, PNG/JPEG/SVG).',
}

export function uploadLogoErrorMessage(code: string): string {
  return UPLOAD_LOGO_ERRORS[code] ?? 'No se pudo subir el logo. Intenta de nuevo.'
}

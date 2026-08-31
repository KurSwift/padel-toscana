import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'

export const DEFAULT_SITE_NAME = 'Padel Toscana'

interface SiteSettingsContextValue {
  siteName: string
  // null = nadie configuró un link — quien lo use cae a su fallback actual
  // (texto plano en HelpPage, ver src/pages/HelpPage.tsx).
  whatsappUrl: string | null
}

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  siteName: DEFAULT_SITE_NAME,
  whatsappUrl: null,
})

// Mismo molde que ThemeContext: onSnapshot sobre un doc único
// (settings/general, ver firestore.rules), sin depender de estar
// autenticado — LoginPage también necesita el nombre correcto antes del
// login. Se monta fuera de AuthProvider en App.tsx.
export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [siteName, setSiteName] = useState(DEFAULT_SITE_NAME)
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      const data = snap.data()
      setSiteName((data?.siteName as string) || DEFAULT_SITE_NAME)
      setWhatsappUrl((data?.whatsappUrl as string) || null)
    })
    return unsub
  }, [])

  // Cubre el título de la pestaña del navegador en runtime — manifest.json
  // (nombre al "agregar a inicio") y los meta tags estáticos de index.html
  // se quedan en "Padel Toscana" (limitación conocida, ver TASKS.md, mismo
  // criterio que el logo/color con archivos estáticos).
  useEffect(() => {
    document.title = siteName
  }, [siteName])

  return (
    <SiteSettingsContext.Provider value={{ siteName, whatsappUrl }}>
      {children}
    </SiteSettingsContext.Provider>
  )
}

export const useSiteSettings = () => useContext(SiteSettingsContext)

import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'
import { BRAND_TONES, DEFAULT_PALETTE_ID, getPalette } from '@/theme/palettes'

interface ThemeContextValue {
  paletteId: string
}

const ThemeContext = createContext<ThemeContextValue>({ paletteId: DEFAULT_PALETTE_ID })

// Mismo molde que AuthContext: onSnapshot sobre un doc único
// (settings/theme, ver firestore.rules), sin depender de que la persona
// esté autenticada — LoginPage también necesita la paleta correcta antes
// del login, por eso se monta fuera de AuthProvider en App.tsx.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'theme'), (snap) => {
      setPaletteId(snap.exists() ? (snap.data().paletteId as string) : DEFAULT_PALETTE_ID)
    })
    return unsub
  }, [])

  // tailwind.config.js apunta brand.{50..900} a estas variables (ver
  // src/index.css para los valores default) — aplicarlas en
  // document.documentElement recolorea toda la UI sin recargar.
  useEffect(() => {
    const palette = getPalette(paletteId)
    for (const tone of BRAND_TONES) {
      document.documentElement.style.setProperty(`--brand-${tone}`, palette.tones[tone])
    }
  }, [paletteId])

  return <ThemeContext.Provider value={{ paletteId }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

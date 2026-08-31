import { useEffect, useState } from 'react'
import { getLogoUrl } from '@/services/branding'

interface LogoProps {
  // sm: navbar (Header.tsx). lg: tarjeta de login (LoginPage.tsx) — mismo
  // tamaño que el badge "P" que reemplaza ahí.
  size?: 'sm' | 'lg'
}

const SIZES: Record<NonNullable<LogoProps['size']>, { box: string; text: string }> = {
  sm: { box: 'w-9 h-9 rounded-xl', text: 'text-base' },
  lg: { box: 'w-16 h-16 rounded-2xl', text: 'text-2xl' },
}

// Muestra el logo subido a Storage (branding/logo, ver
// src/services/branding.ts); si nadie ha subido uno todavía (o falla la
// carga), cae al badge "P" verde que ya existía antes del logo real.
export default function Logo({ size = 'sm' }: LogoProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const { box, text } = SIZES[size]

  useEffect(() => {
    let cancelled = false
    getLogoUrl()
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loaded && url) {
    return <img src={url} alt="Padel Toscana" className={`${box} object-cover shrink-0`} />
  }

  return (
    <div className={`${box} bg-brand-600 flex items-center justify-center shrink-0`}>
      <span className={`text-white font-bold ${text}`}>P</span>
    </div>
  )
}

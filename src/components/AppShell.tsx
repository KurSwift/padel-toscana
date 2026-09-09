import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSiteSettings } from '@/context/SiteSettingsContext'
import { AppDestination, navigationForRole } from '@/services/navigationRules'
import { signOut } from '@/services/auth'
import Logo from '@/components/Logo'

function NavigationIcon({ destination }: { destination: AppDestination }) {
  const common = 'w-5 h-5 stroke-current fill-none stroke-[1.8]'
  if (destination === 'calendar') return <svg aria-hidden="true" viewBox="0 0 24 24" className={common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>
  if (destination === 'reservations') return <svg aria-hidden="true" viewBox="0 0 24 24" className={common}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>
  if (destination === 'help') return <svg aria-hidden="true" viewBox="0 0 24 24" className={common}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.8 1.8c-1.6 1.2-1.6 1.7-1.6 2.7M12 17h.01" /></svg>
  if (destination === 'payments') return <svg aria-hidden="true" viewBox="0 0 24 24" className={common}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M7 15h3" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={common}><path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" /><circle cx="12" cy="12" r="4" /></svg>
}

/**
 * Marco común de las pantallas autenticadas: barra superior estilo iOS y
 * navegación inferior en móvil que se convierte en sidebar desde tabletas.
 */
export default function AppShell() {
  const { profile } = useAuth()
  const { siteName } = useSiteSettings()
  const navigate = useNavigate()
  const [accountOpen, setAccountOpen] = useState(false)
  const items = navigationForRole(profile?.role)

  /** Cierra la sesión Firebase y devuelve al flujo público de acceso. */
  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 md:flex">
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:border-gray-200 md:bg-white md:px-3 md:py-5">
        <div className="flex items-center gap-3 px-3 pb-7">
          <Logo size="sm" />
          <span className="font-semibold text-brand-700 truncate">{siteName}</span>
        </div>
        <nav aria-label="Navegación principal" className="space-y-1">
          {items.map((item) => (
            <NavLink key={item.destination} to={item.path} end={item.path === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
              <NavigationIcon destination={item.destination} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-gray-100 pt-3">
          <AccountButton profile={profile} onClick={() => setAccountOpen(true)} />
        </div>
      </aside>

      <div className="min-w-0 flex-1 md:ml-64">
        <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/90 px-5 py-3 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button type="button" onClick={() => setAccountOpen(true)} aria-label="Abrir opciones de cuenta" className="flex min-w-0 items-center gap-1 rounded-lg -ml-2 px-2 py-1 text-left transition hover:bg-gray-100">
              <span className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold leading-5 text-gray-900">{siteName}</h1>
              <p className="truncate text-xs leading-5 text-gray-500">{profile?.name}</p>
              </span>
              <span aria-hidden="true" className="mt-2 shrink-0 text-base text-gray-400">⌄</span>
            </button>
            <button type="button" aria-label="Notificaciones próximamente" title="Notificaciones próximamente" className="grid h-10 w-10 place-items-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            </button>
          </div>
        </header>
        <Outlet />
      </div>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200/80 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden">
        {items.map((item) => (
          <NavLink key={item.destination} to={item.path} end={item.path === '/'} className={({ isActive }) => `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium transition ${isActive ? 'text-brand-700' : 'text-gray-400'}`}>
            <NavigationIcon destination={item.destination} />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      {accountOpen && (
        <AccountSheet
          name={profile?.name ?? ''}
          address={profile?.address ?? ''}
          onClose={() => setAccountOpen(false)}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  )
}

/** Botón de cuenta que permanece disponible al final del sidebar. */
function AccountButton({ profile, onClick }: {
  profile: ReturnType<typeof useAuth>['profile']
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50">
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {profile?.name?.charAt(0).toUpperCase() ?? '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-800">{profile?.name}</span>
        <span className="block truncate text-xs text-gray-500">Mi cuenta</span>
      </span>
      <span aria-hidden="true" className="text-lg text-gray-300">›</span>
    </button>
  )
}

/** Hoja de cuenta con información básica y una acción explícita de salir. */
function AccountSheet({ name, address, onClose, onSignOut }: {
  name: string
  address: string
  onClose: () => void
  onSignOut: () => Promise<void>
}) {
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleClickSignOut() {
    setSigningOut(true)
    await onSignOut()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="account-sheet-title" className="fixed inset-0 z-40 flex items-end bg-black/30 p-3 sm:items-center sm:justify-center">
      <button type="button" aria-label="Cerrar opciones de cuenta" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="text-xs font-medium text-gray-500">Cuenta</p>
          <h2 id="account-sheet-title" className="mt-0.5 text-base font-semibold text-gray-900">{name}</h2>
          <p className="mt-1 text-sm text-gray-500">{address}</p>
        </div>
        <div className="p-2">
          <button type="button" onClick={handleClickSignOut} disabled={signingOut} className="flex min-h-12 w-full items-center rounded-xl px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40">
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
        <div className="border-t border-gray-100 p-2">
          <button type="button" onClick={onClose} disabled={signingOut} className="min-h-11 w-full rounded-xl text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-40">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

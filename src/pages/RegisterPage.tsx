import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { registerUser, checkAddressAvailability } from '@/services/users'
import { signOut } from '@/services/auth'
import { VALID_STREETS, ValidStreet } from '@/types'

type RegStep = 'address' | 'name'

export default function RegisterPage() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()

  // Address — from sessionStorage (fast path) or collected in-page (fallback)
  const [street, setStreet] = useState<ValidStreet | ''>(
    () => (sessionStorage.getItem('reg_street') as ValidStreet | null) ?? '',
  )
  const [streetNumber, setStreetNumber] = useState(
    () => sessionStorage.getItem('reg_streetNumber') ?? '',
  )
  const [step, setStep] = useState<RegStep>(
    () => (sessionStorage.getItem('reg_street') ? 'name' : 'address'),
  )
  const [addressChecking, setAddressChecking] = useState(false)

  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user?.displayName) setName(user.displayName)
  }, [user?.displayName])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Only redirect to /login when truly unauthenticated
  if (!user) return <Navigate to="/login" replace />
  if (profile) return <Navigate to="/" replace />

  // ── Step 1: address ───────────────────────────────────────────────────────

  async function handleAddressContinue() {
    if (!street || !streetNumber.trim()) {
      toast.error('Selecciona tu calle e ingresa tu número.')
      return
    }
    setAddressChecking(true)
    try {
      const available = await checkAddressAvailability(street, streetNumber)
      if (!available) {
        toast.error(
          'Este domicilio ya tiene 2 usuarios registrados. Contacta al administrador.',
          { duration: 5000 },
        )
        return
      }
      sessionStorage.setItem('reg_street', street)
      sessionStorage.setItem('reg_streetNumber', streetNumber.trim())
      setStep('name')
    } catch {
      toast.error('No se pudo verificar el domicilio. Intenta de nuevo.')
    } finally {
      setAddressChecking(false)
    }
  }

  // ── Step 2: name + submit ─────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      toast.error('Ingresa tu nombre completo.')
      return
    }

    setSubmitting(true)
    try {
      await registerUser(user.uid, {
        name: trimmedName,
        street: street as ValidStreet,
        streetNumber: streetNumber.trim(),
        phone: user.phoneNumber ?? undefined,
        email: user.email ?? undefined,
      })
      sessionStorage.removeItem('reg_street')
      sessionStorage.removeItem('reg_streetNumber')
      navigate('/')
    } catch (err) {
      if ((err as Error).message === 'address-full') {
        toast.error('Este domicilio ya fue registrado. Contacta al administrador.', { duration: 5000 })
      } else {
        toast.error('No se pudo guardar tu perfil. Intenta de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    sessionStorage.removeItem('reg_street')
    sessionStorage.removeItem('reg_streetNumber')
    await signOut()
    navigate('/login')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">P</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {step === 'address' ? 'Verifica tu domicilio' : 'Un último paso'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {step === 'address' ? 'Solo colonos de Toscana pueden registrarse' : '¿Cómo te llamamos?'}
          </p>
        </div>

        {step === 'address' ? (
          <>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Calle</label>
              <div className="grid grid-cols-3 gap-2">
                {VALID_STREETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStreet(s)}
                    className={`py-3 rounded-xl text-sm font-medium transition border ${
                      street === s
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Número</label>
              <input
                type="text"
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddressContinue()}
                placeholder="Ej: 15"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </div>

            <button
              onClick={handleAddressContinue}
              disabled={addressChecking || !street || !streetNumber.trim()}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {addressChecking
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Continuar'
              }
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Address badge */}
            <button
              type="button"
              onClick={() => setStep('address')}
              className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 w-full text-left"
            >
              <span className="text-brand-600 text-lg">🏠</span>
              <div className="flex-1">
                <p className="text-xs text-brand-500 font-medium">Tu domicilio</p>
                <p className="text-sm text-brand-700 font-semibold">{street} {streetNumber}</p>
              </div>
              <span className="text-xs text-gray-400">Cambiar</span>
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: María García"
                autoComplete="name"
                autoFocus
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand-500 transition text-sm"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Así te verán los demás colonos al reservar.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {submitting
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Entrar a Padel Toscana'
              }
            </button>
          </form>
        )}

        <button
          onClick={handleSignOut}
          className="w-full text-sm text-gray-400 hover:text-gray-600 mt-6 text-center"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

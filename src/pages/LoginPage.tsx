import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecaptchaVerifier, ConfirmationResult } from 'firebase/auth'
import toast from 'react-hot-toast'
import { auth } from '@/firebase'
import { signInWithGoogle, sendPhoneOtp, verifyOtp, signOut } from '@/services/auth'
import { getResidentsByAddress, checkUserExists } from '@/services/users'
import { VALID_STREETS, ValidStreet } from '@/types'

// Excepción hardcodeada: esta es la única cuenta que predata el modelo de
// alta por admin (entra con Google, no con teléfono asignado) — ver
// TASKS.md. Cualquier otro domicilio solo tiene la opción de teléfono.
const GOOGLE_LOGIN_ADDRESS = 'nogal 35'

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-phone-number': 'Número de teléfono inválido.',
  'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
  'auth/invalid-verification-code': 'Código incorrecto.',
  'auth/code-expired': 'El código expiró. Solicita uno nuevo.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
}

function getErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? ''
  if (code in ERROR_MESSAGES) return ERROR_MESSAGES[code]
  return 'Ocurrió un error. Intenta de nuevo.'
}

const RESEND_SECONDS = 60
type Step = 'address' | 'phone' | 'otp'

export default function LoginPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('address')

  // Address
  const [street, setStreet] = useState<ValidStreet | ''>('')
  const [streetNumber, setStreetNumber] = useState('')
  const [addressLoading, setAddressLoading] = useState(false)
  const [residentNames, setResidentNames] = useState<string[]>([])

  // Auth
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const confirmationRef = useRef<ConfirmationResult | null>(null)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    if (resendTimer <= 0) return
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000)
    return () => clearTimeout(id)
  }, [resendTimer])

  useEffect(() => () => { recaptchaRef.current?.clear() }, [])

  function getVerifier(): RecaptchaVerifier {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
    }
    return recaptchaRef.current
  }

  function clearVerifier() {
    recaptchaRef.current?.clear()
    recaptchaRef.current = null
  }

  async function afterAuth(uid: string) {
    const exists = await checkUserExists(uid)
    if (exists) {
      navigate('/')
      return
    }
    await signOut()
    toast.error('No encontramos tu cuenta. Contacta al administrador.', { duration: 5000 })
  }

  // ── Address check ───────────────────────────────────────────────────────

  async function handleAddressContinue() {
    if (!street || !streetNumber.trim()) {
      toast.error('Selecciona tu calle e ingresa tu número.')
      return
    }
    setAddressLoading(true)
    try {
      const names = await getResidentsByAddress(street, streetNumber)
      if (names.length === 0) {
        toast.error('No encontramos un colono registrado en este domicilio. Contacta al administrador.', { duration: 5000 })
        return
      }
      setResidentNames(names)
      setStep('phone')
    } catch {
      toast.error('No se pudo verificar el domicilio. Intenta de nuevo.')
    } finally {
      setAddressLoading(false)
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function handleGoogleSignIn() {
    setLoading(true)
    try {
      const result = await signInWithGoogle()
      await afterAuth(result.user.uid)
    } catch (err) {
      const msg = getErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) { toast.error('Ingresa 10 dígitos.'); return }
    setLoading(true)
    try {
      const result = await sendPhoneOtp(`+52${digits}`, getVerifier())
      confirmationRef.current = result
      setStep('otp')
      setResendTimer(RESEND_SECONDS)
    } catch (err) {
      clearVerifier()
      const msg = getErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) { toast.error('El código es de 6 dígitos.'); return }
    if (!confirmationRef.current) return
    setLoading(true)
    try {
      const result = await verifyOtp(confirmationRef.current, otp)
      await afterAuth(result.user.uid)
    } catch (err) {
      const msg = getErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    clearVerifier()
    setOtp('')
    await handleSendOtp()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="text-center pt-8 px-8 pb-6">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Padel Toscana</h1>
        </div>

        <div className="px-8 pb-8 pt-2">

          {/* ── Address step ── */}
          {step === 'address' && (
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
                disabled={addressLoading || !street || !streetNumber.trim()}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {addressLoading ? <Spinner /> : 'Continuar'}
              </button>
            </>
          )}

          {/* ── Auth step ── */}
          {step === 'phone' && (
            <>
              <button
                onClick={() => setStep('address')}
                className="flex items-center gap-2 text-sm mb-5 w-full"
              >
                <span className="bg-brand-50 border border-brand-200 text-brand-700 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  🏠 {street} {streetNumber}
                </span>
                <span className="text-xs text-gray-400 hover:text-gray-600">Cambiar</span>
              </button>

              <p className="text-sm text-gray-600 mb-5">
                Bienvenid@ <span className="font-semibold text-gray-900">{residentNames.join(' y ')}</span>, ingresa tu número de teléfono para continuar
              </p>

              {`${street} ${streetNumber}`.trim().toLowerCase() === GOOGLE_LOGIN_ADDRESS && (
                <>
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl py-3 px-4 text-gray-700 font-medium hover:bg-gray-50 transition disabled:opacity-50 mb-5"
                  >
                    <GoogleIcon />
                    Continuar con Google
                  </button>

                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-sm text-gray-400">o</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Número de celular</label>
                <div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                  <span className="bg-gray-50 px-3 py-3 text-gray-500 text-sm border-r border-gray-300 flex items-center select-none">
                    🇲🇽 +52
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="5512345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    className="flex-1 px-3 py-3 text-gray-900 placeholder-gray-400 outline-none text-sm bg-white"
                  />
                </div>
              </div>

              <button
                onClick={handleSendOtp}
                disabled={loading || phone.replace(/\D/g, '').length !== 10}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading ? <Spinner /> : 'Enviar código'}
              </button>
            </>
          )}

          {/* ── OTP step ── */}
          {step === 'otp' && (
            <>
              <button
                onClick={() => { setStep('phone'); setOtp('') }}
                className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-6"
              >
                ← Cambiar número
              </button>

              <p className="text-sm text-gray-600 mb-4">
                Enviamos un código al{' '}
                <span className="font-semibold text-gray-900">+52 {phone}</span>
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Código de verificación</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-gray-900 placeholder-gray-300 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-40 flex items-center justify-center gap-2 mb-4"
              >
                {loading ? <Spinner /> : 'Verificar'}
              </button>

              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-gray-400">Reenviar en <span className="font-medium">{resendTimer}s</span></p>
                ) : (
                  <button onClick={handleResend} disabled={loading} className="text-sm text-brand-600 font-medium">
                    Reenviar código
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div id="recaptcha-container" />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
}

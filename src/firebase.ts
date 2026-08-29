import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: 'AIzaSyB7vK1y9IlrRGaWZ0191tfgyQtZOtvQklw',
  authDomain: 'padel-toscana.firebaseapp.com',
  projectId: 'padel-toscana',
  storageBucket: 'padel-toscana.firebasestorage.app',
  messagingSenderId: '39494892529',
  appId: '1:39494892529:web:258d621316b4cdd07be250',
  measurementId: 'G-225T8DENJV',
}

const app = initializeApp(firebaseConfig)

// In dev, the SDK prints a debug token to the console.
// Register that token in Firebase Console → App Check → Manage debug tokens.
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LcFH90sAAAAAP9avti2sXIlJcb_bXzCUWC8Wirr'),
  isTokenAutoRefreshEnabled: true,
})

export const auth = getAuth(app)
export const db = getFirestore(app)

// Apunta Auth/Firestore a los emuladores locales en vez de producción.
// Actívalo copiando .env.local.example a .env.local (VITE_USE_EMULATORS=true)
// y corriendo `npm run emulators` en paralelo. Ver AGENTS.md.
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  // Evita que el login por teléfono dependa de resolver el reCAPTCHA real
  // de Google (lento e intermitente contra servicios externos) — el
  // emulador de Auth no lo necesita para generar/validar el código OTP.
  auth.settings.appVerificationDisabledForTesting = true
  // eslint-disable-next-line no-console
  console.info('[firebase] Usando emuladores locales — Auth :9099, Firestore :8080')
}

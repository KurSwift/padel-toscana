import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

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
// Analytics nunca corre contra emuladores: sus eventos de prueba contaminarían
// las métricas de producción y no aportan verificación útil al flujo local.
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'

// `isSupported()` evita inicializar Analytics en navegadores sin las APIs que
// necesita (o durante tests). El servicio analytics.ts omite eventos hasta
// que esta instancia esté lista, sin interrumpir ningún flujo de la app.
export let analytics: Analytics | null = null
if (!useEmulators) {
  void isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app)
  }).catch(() => {})
}

// In dev, the SDK prints a debug token to the console.
// Register that token in Firebase Console → App Check → Manage debug tokens.
//
// VITE_APPCHECK_DEBUG_TOKEN (opcional, .env.local): fija el debug token a
// un valor conocido en vez de dejar que el SDK genere uno nuevo por sesión
// de navegador. Necesario para e2e/Playwright — cada test corre en un
// contexto de navegador nuevo, así que un token generado con `= true` nunca
// llegaría a registrarse a tiempo. Registra ese valor una vez vía Firebase
// Console → App Check → Manage debug tokens (o la API de
// firebaseappcheck.googleapis.com) y los runs de e2e siguientes lo
// reutilizan sin fricción. Sin esta variable, el comportamiento interactivo
// normal (`= true`, un token nuevo impreso en consola cada vez) sigue igual.
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true
}

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LcFH90sAAAAAP9avti2sXIlJcb_bXzCUWC8Wirr'),
  isTokenAutoRefreshEnabled: true,
})

export const auth = getAuth(app)
export const db = getFirestore(app)
// Región debe coincidir con la de functions/src/index.ts (onCall({ region }, ...)).
export const functions = getFunctions(app, 'us-central1')
export const storage = getStorage(app)

// Apunta Auth/Firestore a los emuladores locales en vez de producción.
// Actívalo copiando .env.local.example a .env.local (VITE_USE_EMULATORS=true)
// y corriendo `npm run emulators` en paralelo. Ver AGENTS.md.
// EMULATOR_HOST es 127.0.0.1 por default; para probar desde el celular en la
// misma red WiFi, pon VITE_EMULATOR_HOST=<IP local de tu Mac> en .env.local
// (ver AGENTS.md) — 127.0.0.1 en el celular apunta al celular mismo, no a la Mac.
if (useEmulators) {
  const emulatorHost = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1'
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, emulatorHost, 8080)
  connectFunctionsEmulator(functions, emulatorHost, 5001)
  connectStorageEmulator(storage, emulatorHost, 9199)
  // Evita que el login por teléfono dependa de resolver el reCAPTCHA real
  // de Google (lento e intermitente contra servicios externos) — el
  // emulador de Auth no lo necesita para generar/validar el código OTP.
  auth.settings.appVerificationDisabledForTesting = true
  // eslint-disable-next-line no-console
  console.info('[firebase] Usando emuladores locales — Auth :9099, Firestore :8080, Functions :5001, Storage :9199')
}

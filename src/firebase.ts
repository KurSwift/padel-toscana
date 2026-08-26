import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
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

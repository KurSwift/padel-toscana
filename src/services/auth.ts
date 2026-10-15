import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  ConfirmationResult,
  signInWithPopup,
  signInWithPhoneNumber,
  signInWithCredential,
  signOut as firebaseSignOut,
  type UserCredential,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/firebase'

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  return signInWithPopup(auth, provider)
}

const linkGoogleAccountCallable = httpsCallable(functions, 'linkGoogleAccount')

// Para un login de Google que cayó en una cuenta sin perfil: pide a
// linkGoogleAccount (functions/src/index.ts) que vincule ese Google al
// colono cuyo email coincide y luego vuelve a entrar con la misma
// credencial (sin otro popup), ahora sobre el uid original. Devuelve ese
// uid. Lanza Error con el código de la función ('gmail-not-found', etc.).
export async function linkGoogleToColono(result: UserCredential): Promise<string> {
  const credential = GoogleAuthProvider.credentialFromResult(result)
  if (!credential) throw new Error('google-credential-missing')
  try {
    await linkGoogleAccountCallable()
  } catch (err) {
    throw new Error((err as { message?: string }).message ?? 'unknown-error')
  }
  return (await signInWithCredential(auth, credential)).user.uid
}

export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
}

export async function sendPhoneOtp(
  phoneNumber: string,
  verifier: RecaptchaVerifier,
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber, verifier)
}

export async function verifyOtp(confirmation: ConfirmationResult, otp: string) {
  return confirmation.confirm(otp)
}

export function signOut() {
  return firebaseSignOut(auth)
}

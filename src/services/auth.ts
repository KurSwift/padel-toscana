import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  ConfirmationResult,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { auth } from '@/firebase'

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  return signInWithPopup(auth, provider)
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

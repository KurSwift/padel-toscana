import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/firebase'
import { UserProfile, UserRole, ValidStreet } from '@/types'

// Can be called before authentication (addresses are publicly readable)
export async function checkAddressAvailability(
  street: string,
  streetNumber: string,
): Promise<boolean> {
  const key = `${street} ${streetNumber.trim()}`.toLowerCase()
  const snap = await getDoc(doc(db, 'addresses', key))
  if (!snap.exists()) return true
  const uids = snap.data().uids as string[]
  return uids.length < MAX_USERS_PER_ADDRESS
}

export async function checkUserExists(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists()
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)
}

// Cambia el rol de un usuario (colono/admin/tesorero). Solo admins pueden
// llamar esto en la práctica — reforzado en firestore.rules, no aquí. La
// UI que llama esta función debe además bloquear que un admin se cambie su
// propio rol (ver canActOnUser en userRules.ts) antes de invocarla.
export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role })
}

export async function approveUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { status: 'active' })
}

export async function rejectUser(profile: UserProfile): Promise<void> {
  const addressKey =
    profile.addressNormalized ??
    `${profile.street} ${profile.streetNumber}`.toLowerCase()
  const addressRef = doc(db, 'addresses', addressKey)
  const userRef = doc(db, 'users', profile.uid)

  await runTransaction(db, async (tx) => {
    const addressSnap = await tx.get(addressRef)
    if (addressSnap.exists()) {
      const uids = (addressSnap.data().uids as string[]).filter(
        (u) => u !== profile.uid,
      )
      tx.update(addressRef, { uids })
    }
    tx.delete(userRef)
  })
}

const MAX_USERS_PER_ADDRESS = 2

export async function registerUser(
  uid: string,
  data: {
    name: string
    street: string
    streetNumber: string
    phone?: string
    email?: string
  },
) {
  const addressKey = `${data.street} ${data.streetNumber.trim()}`.toLowerCase()
  const addressRef = doc(db, 'addresses', addressKey)
  const userRef = doc(db, 'users', uid)

  await runTransaction(db, async (tx) => {
    const addressSnap = await tx.get(addressRef)
    const userSnap = await tx.get(userRef)

    if (userSnap.exists()) return

    const uids: string[] = addressSnap.exists()
      ? (addressSnap.data().uids as string[])
      : []

    if (uids.length >= MAX_USERS_PER_ADDRESS && !uids.includes(uid)) {
      throw new Error('address-full')
    }

    const address = `${data.street} ${data.streetNumber.trim()}`

    tx.set(userRef, {
      name: data.name.trim(),
      street: data.street,
      streetNumber: data.streetNumber.trim(),
      address,
      addressNormalized: addressKey,
      phone: data.phone ?? null,
      email: data.email ?? null,
      role: 'colono',
      status: 'pending',
      createdAt: serverTimestamp(),
    })

    tx.set(addressRef, { uids: [...new Set([...uids, uid])] }, { merge: true })
  })

  await addDoc(collection(db, 'mail'), {
    to: ['ernesto.sanchez.kuri@gmail.com'],
    message: {
      subject: '🎾 Nueva solicitud de registro – Padel Toscana',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#16a34a">Nueva solicitud de registro</h2>
          <p>Un nuevo usuario solicita acceso a Padel Toscana:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#6b7280;width:120px">Nombre</td><td style="font-weight:600">${data.name.trim()}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280">Domicilio</td><td style="font-weight:600">${data.street} ${data.streetNumber.trim()}</td></tr>
            ${data.phone ? `<tr><td style="padding:8px 0;color:#6b7280">Teléfono</td><td>${data.phone}</td></tr>` : ''}
            ${data.email ? `<tr><td style="padding:8px 0;color:#6b7280">Email</td><td>${data.email}</td></tr>` : ''}
          </table>
          <a href="https://padel-toscana.web.app/admin" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Ver en Panel Admin
          </a>
        </div>
      `,
    },
  })
}

// ── Alta de colonos por admin (ver TASKS.md) ────────────────────────────────
// registerUser() de arriba sigue intacta — la sigue usando RegisterPage.tsx.
// Estas dos funciones son el reemplazo como punto de entrada normal:
// getResidentsByAddress para el saludo pre-auth de LoginPage, adminCreateColono
// para el alta desde AdminPage. Ambas corren en functions/src/index.ts
// (Admin SDK — el navegador no puede crear cuentas de Auth ajenas).

const getResidentsByAddressCallable = httpsCallable(functions, 'getResidentsByAddress')
const adminCreateColonoCallable = httpsCallable(functions, 'adminCreateColono')

// Saludo pre-auth en LoginPage. Array vacío = "nadie registrado en este
// domicilio" — no es un error, LoginPage lo maneja como caso normal.
export async function getResidentsByAddress(
  street: string,
  streetNumber: string,
): Promise<string[]> {
  try {
    const result = await getResidentsByAddressCallable({ street, streetNumber })
    return (result.data as { names: string[] }).names
  } catch (err) {
    // Mismo patrón que createReservationCallable en reservations.ts: el SDK
    // de Functions expone el segundo argumento de HttpsError como `.message`.
    throw new Error((err as { message?: string }).message ?? 'unknown-error')
  }
}

// Solo admin (reforzado en la función, no aquí). `phone` ya debe venir
// formateado +52XXXXXXXXXX (mismo formato que LoginPage arma antes de
// mandar el OTP).
export async function adminCreateColono(data: {
  name: string
  street: ValidStreet
  streetNumber: string
  phone: string
}): Promise<{ uid: string }> {
  try {
    const result = await adminCreateColonoCallable(data)
    return result.data as { uid: string }
  } catch (err) {
    throw new Error((err as { message?: string }).message ?? 'unknown-error')
  }
}

const ADMIN_CREATE_COLONO_ERRORS: Record<string, string> = {
  'address-full': 'Este domicilio ya tiene 2 colonos registrados.',
  'phone-already-registered': 'Este teléfono ya está registrado a otra cuenta.',
  'invalid-name': 'Ingresa un nombre válido.',
  'invalid-street': 'Selecciona una calle válida.',
  'invalid-street-number': 'Ingresa el número del domicilio.',
  'invalid-phone': 'El teléfono debe tener 10 dígitos.',
  'admin-only': 'No tienes permisos de administrador.',
}

export function adminCreateColonoErrorMessage(code: string): string {
  return ADMIN_CREATE_COLONO_ERRORS[code] ?? 'No se pudo agregar al colono. Intenta de nuevo.'
}

// Elimina una cuenta por completo (Auth + Firestore + libera el cupo del
// domicilio) — exclusivo de super-admin, reforzado en la función
// (adminDeleteColono, functions/src/index.ts), no aquí. La UI que llama
// esta función debe además bloquear que un super-admin se elimine a sí
// mismo (ver canActOnUser en userRules.ts) antes de invocarla.
const adminDeleteColonoCallable = httpsCallable(functions, 'adminDeleteColono')

export async function deleteColono(uid: string): Promise<void> {
  try {
    await adminDeleteColonoCallable({ uid })
  } catch (err) {
    throw new Error((err as { message?: string }).message ?? 'unknown-error')
  }
}

const DELETE_COLONO_ERRORS: Record<string, string> = {
  'super-admin-only': 'Solo un super-admin puede eliminar usuarios.',
  'cannot-delete-self': 'No puedes eliminarte a ti mismo.',
  'user-not-found': 'Ese usuario ya no existe.',
}

export function deleteColonoErrorMessage(code: string): string {
  return DELETE_COLONO_ERRORS[code] ?? 'No se pudo eliminar al usuario. Intenta de nuevo.'
}

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
import { db } from '@/firebase'
import { UserProfile, UserRole } from '@/types'

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
// propio rol (ver canChangeRole en userRules.ts) antes de invocarla.
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

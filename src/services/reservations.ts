import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { Court, Reservation } from '@/types'
import { addHours } from '@/utils/time'
import { hasOverlap, countOccupyingReservations } from '@/services/reservationRules'

const ERRORS: Record<string, string> = {
  'slot-taken': 'Este horario ya fue reservado. Elige otro.',
  'max-reservations': 'Ya tienes una reservación activa.',
  'outside-hours': 'El horario está fuera del rango permitido.',
}

export function reservationErrorMessage(code: string): string {
  return ERRORS[code] ?? 'No se pudo crear la reservación. Intenta de nuevo.'
}

export async function createReservation(params: {
  court: Court
  userId: string
  userName: string
  userAddress: string
  date: string
  startTime: string
  durationHours: number
}): Promise<void> {
  const { court, userId, userName, userAddress, date, startTime, durationHours } = params
  const endTime = addHours(startTime, durationHours)

  if (endTime > court.settings.closeTime) throw new Error('outside-hours')

  // Check user active reservation limit
  const userSnap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
    ),
  )
  const userReservations = userSnap.docs.map((d) => d.data() as Reservation)
  if (countOccupyingReservations(userReservations) >= court.settings.maxActiveReservationsPerUser) {
    throw new Error('max-reservations')
  }

  // Check for time overlaps on this court/date
  const daySnap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('courtId', '==', court.id),
      where('date', '==', date),
      where('status', '==', 'active'),
    ),
  )
  const existing = daySnap.docs.map((d) => d.data() as Reservation)
  if (hasOverlap(existing, startTime, endTime)) {
    throw new Error('slot-taken')
  }

  await addDoc(collection(db, 'reservations'), {
    courtId: court.id,
    userId,
    userName,
    userAddress,
    date,
    startTime,
    endTime,
    durationHours,
    status: 'active',
    createdAt: serverTimestamp(),
  })
}

export async function cancelReservation(reservationId: string): Promise<void> {
  await updateDoc(doc(db, 'reservations', reservationId), { status: 'cancelled' })
}

export function subscribeToReservations(
  courtId: string,
  date: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('courtId', '==', courtId),
      where('date', '==', date),
      where('status', '==', 'active'),
    ),
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Reservation)),
  )
}

export function subscribeToAllReservationsByDate(
  date: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('date', '==', date),
      where('status', '==', 'active'),
    ),
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Reservation)),
  )
}

export function subscribeToUserReservations(
  userId: string,
  onUpdate: (reservations: Reservation[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'reservations'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
    ),
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Reservation)),
  )
}

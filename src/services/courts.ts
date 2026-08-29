import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { Court, CourtSettings } from '@/types'

export const DEFAULT_COURT_SETTINGS: CourtSettings = {
  openTime: '07:00',
  closeTime: '23:00',
  minDurationHours: 1,
  maxDurationHours: 2,
  slotIntervalMinutes: 60,
  maxActiveReservationsPerUser: 2,
  daysAheadAllowed: 7,
  minLeadHours: 24,
  paymentDeadlineHours: 12,
}

export async function getActiveCourts(): Promise<Court[]> {
  const snap = await getDocs(
    query(collection(db, 'courts'), where('isActive', '==', true)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Court)
}

export async function getAllCourts(): Promise<Court[]> {
  const snap = await getDocs(collection(db, 'courts'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Court)
}

export async function updateCourtSettings(courtId: string, settings: CourtSettings) {
  await updateDoc(doc(db, 'courts', courtId), { settings })
}

export async function toggleCourtActive(courtId: string, isActive: boolean) {
  await updateDoc(doc(db, 'courts', courtId), { isActive })
}

export async function createCourt(name: string): Promise<string> {
  const ref = doc(collection(db, 'courts'))
  await setDoc(ref, {
    name,
    isActive: true,
    settings: DEFAULT_COURT_SETTINGS,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

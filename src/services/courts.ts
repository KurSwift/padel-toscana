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
import { Court, CourtSettings, CourtType } from '@/types'

// Defaults por tipo de recurso (issue 1/8 del épico #60 — reservación de la
// casa club). Los valores de casa club vienen de las decisiones ya tomadas
// en el Epic #60: depósito $3,000/reembolsable $2,000, aforo 30, tope 2
// reservaciones/mes, cancelación con 48h de anticipación.
export const DEFAULT_COURT_SETTINGS_BY_TYPE: Record<CourtType, CourtSettings> = {
  cancha: {
    openTime: '07:00',
    closeTime: '23:00',
    minDurationHours: 1,
    maxDurationHours: 2,
    slotIntervalMinutes: 60,
    maxActiveReservationsPerUser: 2,
    daysAheadAllowed: 7,
    minLeadHours: 24,
    paymentDeadlineHours: 12,
    reservationFee: 300,
    maxPlayerCount: 10,
  },
  'casa-club': {
    openTime: '00:00',
    closeTime: '23:59',
    minDurationHours: 24,
    maxDurationHours: 24,
    slotIntervalMinutes: 1440,
    maxActiveReservationsPerUser: 2,
    daysAheadAllowed: 90,
    minLeadHours: 72,
    paymentDeadlineHours: 12,
    reservationFee: 3000,
    maxPlayerCount: 30,
    depositAmount: 3000,
    depositRefundableAmount: 2000,
    cancellationDeadlineHours: 48,
    maxReservationsPerUserPerMonth: 2,
  },
}

// Mantenido para no romper importadores existentes (panel de admin, seeds,
// tests) hasta que el épico #60 los actualice — equivale a los defaults de
// cancha, que es el único tipo que existía antes de este issue.
export const DEFAULT_COURT_SETTINGS: CourtSettings = DEFAULT_COURT_SETTINGS_BY_TYPE.cancha

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

export async function createCourt(name: string, type: CourtType = 'cancha'): Promise<string> {
  const ref = doc(collection(db, 'courts'))
  await setDoc(ref, {
    name,
    isActive: true,
    type,
    settings: DEFAULT_COURT_SETTINGS_BY_TYPE[type],
    createdAt: serverTimestamp(),
  })
  return ref.id
}

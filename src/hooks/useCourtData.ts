import { useEffect, useState } from 'react'
import { Court, Reservation } from '@/types'
import { getActiveCourts } from '@/services/courts'
import { subscribeToReservations, subscribeToUserReservations } from '@/services/reservations'

interface CourtData {
  court: Court | null
  reservations: Reservation[]
  userReservations: Reservation[]
  loading: boolean
}

export function useCourtData(userId: string, selectedDate: string): CourtData {
  const [court, setCourt] = useState<Court | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [userReservations, setUserReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActiveCourts().then((courts) => {
      setCourt(courts[0] ?? null)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!court) return
    return subscribeToReservations(court.id, selectedDate, setReservations)
  }, [court, selectedDate])

  useEffect(() => {
    if (!userId) return
    return subscribeToUserReservations(userId, setUserReservations)
  }, [userId])

  return { court, reservations, userReservations, loading }
}

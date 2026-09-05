import { useEffect, useState } from 'react'
import { Court, CourtType, Reservation } from '@/types'
import { getActiveCourts } from '@/services/courts'
import { subscribeToReservations, subscribeToUserReservations } from '@/services/reservations'

interface CourtData {
  court: Court | null
  reservations: Reservation[]
  userReservations: Reservation[]
  loading: boolean
}

// Antes de la épica #60 (issue 6/8) solo existía un tipo de recurso, así
// que tomar courts[0] a ciegas nunca era un bug observable — con dos tipos
// activos a la vez, `courtType` decide cuál de los dos alimenta la página.
// userReservations se filtra en JS al courtId del recurso seleccionado
// (mismo patrón que matchesCourtType en reservationRules.ts): "Mis
// reservaciones" muestra solo el recurso activo, no los dos mezclados —
// subscribeToUserReservations ya trae todas las del usuario sin filtrar
// por cancha, así que filtrar acá no pide un índice compuesto nuevo.
export function useCourtData(userId: string, courtType: CourtType, selectedDate: string): CourtData {
  const [courts, setCourts] = useState<Court[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [allUserReservations, setAllUserReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActiveCourts().then((cs) => {
      setCourts(cs)
      setLoading(false)
    })
  }, [])

  const court = courts.find((c) => (c.type ?? 'cancha') === courtType) ?? null

  useEffect(() => {
    if (!court) return
    return subscribeToReservations(court.id, selectedDate, setReservations)
  }, [court, selectedDate])

  useEffect(() => {
    if (!userId) return
    return subscribeToUserReservations(userId, setAllUserReservations)
  }, [userId])

  const userReservations = court
    ? allUserReservations.filter((r) => r.courtId === court.id)
    : []

  return { court, reservations, userReservations, loading }
}

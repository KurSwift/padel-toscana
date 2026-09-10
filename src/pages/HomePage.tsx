import { useAuth } from '@/context/AuthContext'
import ReservationCalendar from '@/components/ReservationCalendar'

/** Calendario de reservaciones propias del usuario autenticado. */
export default function HomePage() {
  const { profile } = useAuth()
  return profile ? <ReservationCalendar profile={profile} /> : null
}

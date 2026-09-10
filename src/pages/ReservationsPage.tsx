import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import MyReservations from '@/components/MyReservations'
import { Court, Reservation } from '@/types'
import { getAllCourts } from '@/services/courts'
import { subscribeToUserReservations } from '@/services/reservations'

/** Muestra las reservaciones activas del usuario agrupadas por recurso. */
export default function ReservationsPage() {
  const { user } = useAuth()
  const [courts, setCourts] = useState<Court[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    getAllCourts()
      .then(setCourts)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [retryKey])

  useEffect(() => {
    if (!user) return
    // Sin el callback de error, un listener caído dejaba `loading` en true
    // para siempre hasta que la persona refrescara la página a mano — ver
    // logSnapshotFailure en services/reservations.ts.
    return subscribeToUserReservations(user.uid, setReservations, () => setError(true))
  }, [user, retryKey])

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-6 pb-24 md:px-8 md:pb-8">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Mis reservaciones</h2>
        <p className="mt-1 text-sm text-gray-500">Consulta o cancela tus reservaciones activas.</p>
        {error ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">No se pudieron cargar tus reservaciones.</p>
            <button
              type="button"
              onClick={() => {
                setError(false)
                setRetryKey((k) => k + 1)
              }}
              className="mt-3 min-h-11 rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100"
            >
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>
        ) : reservations.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">No tienes reservaciones activas.</p>
        ) : (
          <div className="mt-6 space-y-8">
            {courts.map((court) => {
              const courtReservations = reservations.filter((reservation) => reservation.courtId === court.id)
              if (courtReservations.length === 0) return null
              return (
                <section key={court.id}>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-gray-800">{court.name}</h3>
                    <span className="text-xs font-medium text-gray-400">
                      {courtReservations.length} {courtReservations.length === 1 ? 'reservación' : 'reservaciones'}
                    </span>
                  </div>
                  <MyReservations reservations={courtReservations} court={court} />
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

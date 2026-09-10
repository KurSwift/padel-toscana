import { useEffect, useState } from 'react'
import { UserProfile } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { getAllUsers } from '@/services/users'
import { canBookForResident, isBookingResident } from '@/services/bookingRules'
import ReservationCalendar from '@/components/ReservationCalendar'

/** Selecciona un colono activo y monta el flujo compartido; cambiarlo descarta cualquier reserva en curso. */
export default function AdminReservationForm({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUid, setSelectedUid] = useState('')
  const allowed = canBookForResident(profile)

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    getAllUsers().then((next) => {
      if (!cancelled) setUsers(next.filter(isBookingResident).sort((a, b) => a.name.localeCompare(b.name, 'es')))
    }).catch(() => {
      if (!cancelled) setError(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [allowed])

  if (!allowed) return <p role="alert">Solo administración puede reservar para un colono.</p>

  const selected = users.find((user) => user.uid === selectedUid)
  const term = search.trim().toLocaleLowerCase('es')
  const matches = users.filter((user) => `${user.name} ${user.address}`.toLocaleLowerCase('es').includes(term))

  return (
    <section aria-label="Reservar para un colono" className="space-y-4">
      <button type="button" onClick={onClose} className="min-h-11 text-sm font-medium text-brand-700">Volver a reservaciones</button>
      <h3 className="text-xl font-bold text-gray-900">Reservar para un colono</h3>
      <p className="text-sm text-gray-500">La reservación quedará en la cuenta del colono y seguirá los plazos, límites y pagos del recurso.</p>
      {loading ? <p role="status">Cargando colonos…</p> : error ? (
        <p role="alert">No se pudieron cargar los colonos. Vuelve a reservaciones e intenta de nuevo.</p>
      ) : selected ? (
        <>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
            <p className="font-semibold text-gray-900">{selected.name}</p>
            <p className="text-sm text-gray-600">{selected.address}</p>
            <button type="button" onClick={() => setSelectedUid('')} className="mt-2 min-h-11 text-sm font-semibold text-brand-700">Cambiar colono</button>
          </div>
          <ReservationCalendar key={selected.uid} profile={selected} forResident />
        </>
      ) : (
        <>
          <label className="block text-sm font-medium text-gray-700">
            Buscar colono por nombre o domicilio
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-gray-300 px-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </label>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white">
            {matches.length === 0 ? <p className="p-4 text-sm text-gray-500">No hay colonos activos que coincidan.</p> : matches.map((user) => (
              <button type="button" key={user.uid} onClick={() => setSelectedUid(user.uid)} className="block min-h-16 w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-brand-50">
                <span className="block text-sm font-semibold text-gray-900">{user.name}</span>
                <span className="block text-xs text-gray-500">{user.address}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Court, Reservation } from '@/types'
import { formatDateShort, formatTime, formatDateTimeShort } from '@/utils/time'
import { cancelReservation } from '@/services/reservations'
import StatusBadge from '@/components/StatusBadge'
import { trackAnalyticsEvent } from '@/services/analytics'
import { useAuth } from '@/context/AuthContext'

interface Props {
  reservations: Reservation[]
  court: Court
}

export default function MyReservations({ reservations, court }: Props) {
  const { profile } = useAuth()
  const [cancelling, setCancelling] = useState<string | null>(null)
  const isCasaClub = (court.type ?? 'cancha') === 'casa-club'

  const sorted = [...reservations].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  )

  async function handleCancel(r: Reservation) {
    setCancelling(r.id)
    try {
      await cancelReservation(r.id, r, court)
      trackAnalyticsEvent('reservation_cancelled', { resource_type: court.type ?? 'cancha', role: profile?.role })
      toast.success('Reservación cancelada.')
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'No se pudo cancelar. Intenta de nuevo.')
    } finally {
      setCancelling(null)
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-400">No tienes reservaciones activas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sorted.map((r) => (
        <div
          key={r.id}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex items-start gap-3 px-4 py-4">
            <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-semibold ${isCasaClub ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>
              {isCasaClub ? '⌂' : '↗'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{formatDateShort(r.date)}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {isCasaClub ? 'Día completo' : `${formatTime(r.startTime)} – ${formatTime(r.endTime)}`}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-3 text-xs font-medium text-gray-500">{court.name}</p>
              {r.status === 'solicitada' && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">Pago pendiente.</span> Antes de {formatDateTimeShort(r.paymentDueAt.toDate())}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-gray-100 px-3 py-2">
            <button
              type="button"
              onClick={() => handleCancel(r)}
              disabled={cancelling === r.id}
              className="min-h-10 w-full rounded-lg text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
            >
              {cancelling === r.id ? 'Cancelando…' : 'Cancelar reservación'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

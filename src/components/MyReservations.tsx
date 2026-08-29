import { useState } from 'react'
import toast from 'react-hot-toast'
import { Reservation } from '@/types'
import { formatDateShort, formatTime, formatDateTimeShort } from '@/utils/time'
import { cancelReservation } from '@/services/reservations'
import StatusBadge from '@/components/StatusBadge'

interface Props {
  reservations: Reservation[]
  courtName: string
}

export default function MyReservations({ reservations, courtName }: Props) {
  const [cancelling, setCancelling] = useState<string | null>(null)

  const sorted = [...reservations].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  )

  async function handleCancel(id: string) {
    setCancelling(id)
    try {
      await cancelReservation(id)
      toast.success('Reservación cancelada.')
    } catch {
      toast.error('No se pudo cancelar. Intenta de nuevo.')
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
          className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-800">
                {formatDateShort(r.date)}
              </p>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatTime(r.startTime)} – {formatTime(r.endTime)} · {courtName}
            </p>
            {r.status === 'solicitada' && (
              <p className="text-xs text-amber-600 mt-1">
                Paga antes de {formatDateTimeShort(r.paymentDueAt.toDate())}
              </p>
            )}
          </div>
          <button
            onClick={() => handleCancel(r.id)}
            disabled={cancelling === r.id}
            className="text-xs text-red-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-40"
          >
            {cancelling === r.id ? '...' : 'Cancelar'}
          </button>
        </div>
      ))}
    </div>
  )
}

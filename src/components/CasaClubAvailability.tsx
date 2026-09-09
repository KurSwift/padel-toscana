import { Reservation } from '@/types'
import StatusBadge from '@/components/StatusBadge'

interface Props {
  reservations: Reservation[]
  userId: string
  onReserve: () => void
}

// Contraparte de SlotsGrid para casa club (issue 6/8 del épico #60):
// reservación de día completo (issue 2/8), así que no hay grilla de
// horarios que mostrar — a lo más una reservación ocupante por fecha
// (traslapes ya lo garantiza del lado del servidor). `reservations` ya
// viene filtrada a la fecha/cancha seleccionada por subscribeToReservations
// (mismo hook que usa SlotsGrid) — misma consulta, sin cambios ahí.
export default function CasaClubAvailability({ reservations, userId, onReserve }: Props) {
  const covering = reservations[0]

  if (covering) {
    const isMine = covering.userId === userId
    return (
      <div
        className={`flex min-h-[88px] items-center gap-3 rounded-2xl px-4 ${isMine ? 'border border-brand-200 bg-brand-50' : 'bg-gray-100'}`}
      >
        <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm ${isMine ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'}`}>
          {isMine ? '✓' : '−'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isMine ? 'text-brand-700' : 'text-gray-500'}`}>
            Casa Club ocupada
          </p>
          <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${isMine ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
            {isMine ? (
              <>
                <span>Tu reservación</span>
                <StatusBadge status={covering.status} />
              </>
            ) : (
              <>
                <span className="truncate">{covering.userName.split(' ')[0]}</span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${isMine ? 'bg-brand-200 text-brand-700' : 'bg-gray-200 text-gray-500'}`}
                >
                  {covering.userAddress}
                </span>
              </>
            )}
          </p>
        </div>
        <span className={`text-xs font-medium ${isMine ? 'text-brand-600' : 'text-gray-400'}`}>{isMine ? 'Tuya' : 'Ocupada'}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onReserve}
      className="flex min-h-[88px] w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 text-left shadow-sm transition hover:border-brand-300 hover:bg-brand-50 active:scale-[0.99] active:bg-brand-100"
    >
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700">+</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-gray-900">Casa Club disponible</span>
        <span className="mt-0.5 block text-xs text-gray-500">Disponible durante todo el día</span>
      </span>
      <span aria-hidden="true" className="text-xl text-brand-600">›</span>
    </button>
  )
}

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
        className={`flex items-center gap-3 px-4 py-4 rounded-xl ${isMine ? 'bg-brand-100 border border-brand-300' : 'bg-gray-100'}`}
      >
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
        <span className="text-lg">{isMine ? '✓' : '🔒'}</span>
      </div>
    )
  }

  return (
    <button
      onClick={onReserve}
      className="w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-white border border-gray-200 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100 transition group"
    >
      <span className="text-sm font-medium text-gray-700">Casa Club disponible</span>
      <span className="ml-auto text-brand-500 opacity-0 group-hover:opacity-100 transition text-sm">
        Reservar →
      </span>
    </button>
  )
}

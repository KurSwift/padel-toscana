import { ReservationStatus } from '@/types'

// Copy y color por status — un solo lugar para los estados, reusado por
// MyReservations, SlotsGrid y AdminPage (selector de status en la pestaña
// Reservaciones). deposito-devuelto/deposito-retenido son exclusivos de
// casa club (issue 4/8 del épico #60) — cancha nunca los usa.
export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  solicitada: 'Pendiente de pago',
  pagada: 'Confirmada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
  'deposito-devuelto': 'Depósito devuelto',
  'deposito-retenido': 'Depósito retenido',
}

const STYLES: Record<ReservationStatus, string> = {
  solicitada: 'bg-amber-100 text-amber-700',
  pagada: 'bg-brand-100 text-brand-700',
  cancelada: 'bg-gray-100 text-gray-500',
  finalizada: 'bg-gray-100 text-gray-400',
  'deposito-devuelto': 'bg-emerald-100 text-emerald-700',
  'deposito-retenido': 'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${STYLES[status]}`}
    >
      {RESERVATION_STATUS_LABELS[status]}
    </span>
  )
}

import { Court, Reservation } from '@/types'
import {
  generateTimeSlots,
  formatTime,
  getAvailableDurations,
  todayString,
} from '@/utils/time'
import StatusBadge from '@/components/StatusBadge'

interface Props {
  court: Court
  reservations: Reservation[]
  selectedDate: string
  userId: string
  onSelectSlot: (startTime: string, availableDurations: number[]) => void
}

export default function SlotsGrid({
  court,
  reservations,
  selectedDate,
  userId,
  onSelectSlot,
}: Props) {
  const { settings } = court
  const slots = generateTimeSlots(settings.openTime, settings.closeTime, settings.slotIntervalMinutes)
  const isToday = selectedDate === todayString()
  const currentHour = new Date().getHours()
  const [closeH] = settings.closeTime.split(':').map(Number)
  const visibleSlots = slots.filter((slotTime) => {
    const [slotH] = slotTime.split(':').map(Number)
    const isPast = isToday && slotH <= currentHour
    const tooLate = slotH + settings.minDurationHours > closeH
    return !isPast && !tooLate
  })

  if (visibleSlots.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-semibold text-gray-700">No quedan horarios disponibles</p>
        <p className="mt-1 text-sm text-gray-500">Prueba con otra fecha para consultar disponibilidad.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="slots-heading">
      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <h3 id="slots-heading" className="text-sm font-semibold text-gray-900">Horarios disponibles</h3>
          <p className="mt-0.5 text-xs text-gray-500">Toca un horario para reservar.</p>
        </div>
        <span className="text-xs font-medium text-gray-400">Elige uno libre</span>
      </div>
      <div className="space-y-2">
      {visibleSlots.map((slotTime) => {
        // Check if covered by a reservation
        const covering = reservations.find(
          (r) => r.startTime <= slotTime && slotTime < r.endTime,
        )

        if (covering) {
          const isStart = covering.startTime === slotTime
          const isMine = covering.userId === userId

          if (!isStart) {
            // Continuation of a multi-hour block — subtle indicator
            return (
              <div
                key={slotTime}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-4 ${isMine ? 'bg-brand-50' : 'bg-gray-100'}`}
              >
                <span className={`w-20 shrink-0 text-sm ${isMine ? 'text-brand-400' : 'text-gray-300'}`}>
                  {formatTime(slotTime)}
                </span>
                <span className={`text-xs ${isMine ? 'text-brand-300' : 'text-gray-300'}`}>Continúa la reservación</span>
              </div>
            )
          }

          // Start of a reservation block
          return (
            <div
              key={slotTime}
              className={`flex min-h-[72px] items-center gap-3 rounded-2xl px-4 ${isMine ? 'border border-brand-200 bg-brand-50' : 'bg-gray-100'}`}
            >
              <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm ${isMine ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'}`}>
                {isMine ? '✓' : '−'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isMine ? 'text-brand-800' : 'text-gray-700'}`}>
                    {formatTime(slotTime)} – {formatTime(covering.endTime)}
                  </span>
                </div>
                <p className={`mt-1 flex text-xs ${isMine ? 'items-center gap-1.5 font-medium text-brand-700' : 'items-center gap-1.5 text-gray-500'}`}>
                  {isMine ? (
                    <>
                      <span>Tu reservación</span>
                      <StatusBadge status={covering.status} />
                    </>
                  ) : (
                    <>
                      <span className="truncate">{covering.userName.split(' ')[0]}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${isMine ? 'bg-brand-200 text-brand-700' : 'bg-gray-200 text-gray-500'}`}>
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

        // Available — compute valid durations
        const durations = getAvailableDurations(
          slotTime,
          settings.minDurationHours,
          settings.maxDurationHours,
          settings.closeTime,
          reservations,
        )

        return (
          <button
            key={slotTime}
            type="button"
            onClick={() => onSelectSlot(slotTime, durations)}
            aria-label={`Reservar ${formatTime(slotTime)}; duraciones: ${durations.join(' y ')} horas`}
            className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 text-left shadow-sm transition hover:border-brand-300 hover:bg-brand-50 active:scale-[0.99] active:bg-brand-100"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              +
            </span>
              <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-gray-900">
                {formatTime(slotTime)}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {durations.map((d) => `${d} ${d === 1 ? 'hora' : 'horas'}`).join(' o ')}
              </span>
            </span>
            <span aria-hidden="true" className="text-xl text-brand-600">›</span>
          </button>
        )
      })}
      </div>
    </section>
  )
}

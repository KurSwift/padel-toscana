import { Court, Reservation } from '@/types'
import {
  generateTimeSlots,
  formatTime,
  getAvailableDurations,
  todayString,
} from '@/utils/time'

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

  return (
    <div className="space-y-2">
      {slots.map((slotTime) => {
        const [slotH] = slotTime.split(':').map(Number)
        const [closeH] = settings.closeTime.split(':').map(Number)

        // Past slot or can't fit minimum duration — hide completely
        const isPast = isToday && slotH <= currentHour
        const tooLate = slotH + settings.minDurationHours > closeH
        if (isPast || tooLate) return null

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
                className={`flex items-center gap-3 px-4 py-3 rounded-xl ${isMine ? 'bg-brand-50' : 'bg-gray-100'}`}
              >
                <span className={`text-sm w-16 shrink-0 ${isMine ? 'text-brand-400' : 'text-gray-300'}`}>
                  {formatTime(slotTime)}
                </span>
                <span className={`text-xs ${isMine ? 'text-brand-300' : 'text-gray-300'}`}>↕</span>
              </div>
            )
          }

          // Start of a reservation block
          return (
            <div
              key={slotTime}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl ${isMine ? 'bg-brand-100 border border-brand-300' : 'bg-gray-100'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium w-16 shrink-0 ${isMine ? 'text-brand-700' : 'text-gray-500'}`}>
                    {formatTime(slotTime)}
                  </span>
                  <span className={`text-xs ${isMine ? 'text-brand-600' : 'text-gray-400'}`}>
                    → {formatTime(covering.endTime)}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ml-[4.5rem] flex items-center gap-1.5 ${isMine ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
                  {isMine ? 'Tu reservación' : (
                    <>
                      <span className="truncate">{covering.userName.split(' ')[0]}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${isMine ? 'bg-brand-200 text-brand-700' : 'bg-gray-200 text-gray-500'}`}>
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
            onClick={() => onSelectSlot(slotTime, durations)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-200 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100 transition group"
          >
            <span className="text-sm font-medium text-gray-700 w-16 shrink-0">
              {formatTime(slotTime)}
            </span>
            <span className="text-xs text-gray-400 group-hover:text-brand-500">
              {durations.map((d) => `${d}h`).join(' · ')}
            </span>
            <span className="ml-auto text-brand-500 opacity-0 group-hover:opacity-100 transition text-sm">
              Reservar →
            </span>
          </button>
        )
      })}
    </div>
  )
}

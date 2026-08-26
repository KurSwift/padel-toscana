import { addDays, formatDateLong, todayString } from '@/utils/time'

interface Props {
  date: string
  maxDaysAhead: number
  onChange: (date: string) => void
}

export default function DateSelector({ date, maxDaysAhead, onChange }: Props) {
  const today = todayString()
  const maxDate = addDays(today, maxDaysAhead)
  const canGoPrev = date > today
  const canGoNext = date < maxDate

  const label = date === today
    ? 'Hoy'
    : date === addDays(today, 1)
    ? 'Mañana'
    : formatDateLong(date)

  return (
    <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
      <button
        onClick={() => onChange(addDays(date, -1))}
        disabled={!canGoPrev}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
      >
        ‹
      </button>
      <span className="font-semibold text-gray-800 text-sm">{label}</span>
      <button
        onClick={() => onChange(addDays(date, 1))}
        disabled={!canGoNext}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
      >
        ›
      </button>
    </div>
  )
}

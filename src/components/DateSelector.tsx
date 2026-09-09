import { addDays, formatDateLong, todayString } from '@/utils/time'

interface Props {
  date: string
  // Primera fecha que cumple la anticipación mínima del recurso. Si se
  // omite, conserva el comportamiento histórico: no permitir días pasados.
  minDate?: string
  maxDaysAhead: number
  onChange: (date: string) => void
}

export default function DateSelector({ date, minDate, maxDaysAhead, onChange }: Props) {
  const today = todayString()
  const maxDate = addDays(today, maxDaysAhead)
  const firstDate = minDate ?? today
  const canGoPrev = date > firstDate
  const canGoNext = date < maxDate

  const fullDate = formatDateLong(date)
  const weekday = fullDate.split(',')[0]
  const label = date === today
    ? 'Hoy'
    : date === addDays(today, 1)
    ? 'Mañana'
    : weekday

  return (
    <div role="group" aria-label={`Fecha seleccionada: ${fullDate}`} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <button
        type="button"
        onClick={() => onChange(addDays(date, -1))}
        disabled={!canGoPrev}
        aria-label="Ver día anterior"
        className="grid h-11 w-11 place-items-center rounded-xl text-2xl leading-none text-gray-500 transition hover:bg-gray-100 disabled:opacity-30"
      >
        ‹
      </button>
      <div className="min-w-0 px-2 text-center">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{fullDate}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(addDays(date, 1))}
        disabled={!canGoNext}
        aria-label="Ver día siguiente"
        className="grid h-11 w-11 place-items-center rounded-xl text-2xl leading-none text-gray-500 transition hover:bg-gray-100 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  )
}

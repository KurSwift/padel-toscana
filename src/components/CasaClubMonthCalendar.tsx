import { useEffect, useMemo, useState } from 'react'
import { subscribeToReservationsByDateRange } from '@/services/reservations'
import { formatMonthYear } from '@/utils/time'
import { canNavigateMonth, getMonthDateRange, isDateSelectable } from '@/components/casaClubCalendarRules'

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

interface Props {
  courtId: string
  selectedDate: string
  minDate: string
  maxDate: string
  onChange: (date: string) => void
}

function monthFromDate(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

/** Calendario mensual de Casa Club: permite elegir un día libre de un vistazo. */
export default function CasaClubMonthCalendar({ courtId, selectedDate, minDate, maxDate, onChange }: Props) {
  const [displayedMonth, setDisplayedMonth] = useState(() => monthFromDate(selectedDate))
  const [lastSelectedDate, setLastSelectedDate] = useState(selectedDate)
  const [occupiedDates, setOccupiedDates] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const { year, month } = displayedMonth
  const { firstDate, lastDate } = useMemo(() => getMonthDateRange(year, month), [year, month])

  useEffect(() => {
    const selected = monthFromDate(selectedDate)
    if (selectedDate !== lastSelectedDate) {
      setDisplayedMonth(selected)
      setLastSelectedDate(selectedDate)
    }
  }, [selectedDate, lastSelectedDate])

  useEffect(() => {
    setLoading(true)
    return subscribeToReservationsByDateRange(
      courtId,
      firstDate,
      lastDate,
      (reservations) => {
        setOccupiedDates(new Set(reservations.map((reservation) => reservation.date)))
        setLoading(false)
      },
      () => {
        setOccupiedDates(new Set())
        setLoading(false)
      },
    )
  }, [courtId, firstDate, lastDate])

  function navigate(direction: -1 | 1) {
    const nextMonth = month + direction
    setDisplayedMonth({
      year: nextMonth === 0 ? year - 1 : nextMonth === 13 ? year + 1 : year,
      month: nextMonth === 0 ? 12 : nextMonth === 13 ? 1 : nextMonth,
    })
  }

  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const canGoPrev = canNavigateMonth(year, month, -1, minDate, maxDate)
  const canGoNext = canNavigateMonth(year, month, 1, minDate, maxDate)

  return (
    <section aria-label="Disponibilidad mensual de Casa Club" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} disabled={!canGoPrev} aria-label="Ver mes anterior" className="grid h-11 w-11 place-items-center rounded-xl text-2xl leading-none text-gray-500 hover:bg-gray-100 disabled:opacity-30">‹</button>
        <p className="text-sm font-semibold text-gray-900">{formatMonthYear(year, month)}</p>
        <button type="button" onClick={() => navigate(1)} disabled={!canGoNext} aria-label="Ver mes siguiente" className="grid h-11 w-11 place-items-center rounded-xl text-2xl leading-none text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => <span key={`${label}-${index}`} className="text-center text-[10px] font-semibold text-gray-400">{label}</span>)}
      </div>
      {loading ? (
        <div className="flex min-h-56 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) return <span key={`empty-${index}`} />
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const occupied = occupiedDates.has(date)
            const selectable = isDateSelectable(date, minDate, maxDate, occupiedDates)
            const selected = date === selectedDate
            return (
              <button
                key={date}
                type="button"
                disabled={!selectable}
                onClick={() => onChange(date)}
                aria-label={`${date}${occupied ? ', ocupada' : selectable ? ', disponible' : ', no disponible'}`}
                className={`aspect-square rounded-lg text-xs font-semibold transition ${selected ? 'bg-brand-600 text-white' : occupied ? 'bg-red-100 text-red-700' : selectable ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'text-gray-300'}`}
              >
                {day}
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-3 flex gap-3 text-[11px] text-gray-500">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-50" />Disponible</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-100" />Ocupada</span>
      </div>
    </section>
  )
}

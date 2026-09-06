import { useState, useEffect } from 'react'
import { getCasaClubCalendar, type CasaClubCalendarEntry } from '@/services/reservations'
import { useSiteSettings } from '@/context/SiteSettingsContext'
import { formatMonthYear, todayString } from '@/utils/time'

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

// Calendario público de casa club (issue 8/8 del épico #60) — ruta fuera de
// ProtectedRoute, sin sesión iniciada, pensada para compartirse como link
// directo en WhatsApp/con el guardia. Los datos vienen de la Cloud
// Function getCasaClubCalendar (functions/src/index.ts), que corre con
// Admin SDK y solo regresa fecha/nombre/domicilio — nunca abre
// firestore.rules de `reservations` a lectura pública (expondría status de
// pago/depósito de cualquier reservación).
export default function CasaClubCalendarPage() {
  const { siteName } = useSiteSettings()
  const today = todayString()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [entries, setEntries] = useState<CasaClubCalendarEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Pública no implica indexable por buscadores — ver PRD.md § 9.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCasaClubCalendar(year, month)
      .then((r) => {
        if (!cancelled) setEntries(r)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year, month])

  function goToPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const entriesByDay = new Map(entries.map((e) => [Number(e.date.slice(-2)), e]))
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-6 px-4">
      <h1 className="text-lg font-bold text-brand-700 mb-0.5">{siteName} · Casa Club</h1>
      <p className="text-xs text-gray-400 mb-4">Calendario de disponibilidad</p>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goToPrevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition"
          >
            ‹
          </button>
          <span className="font-semibold text-gray-800 text-sm">{formatMonthYear(year, month)}</span>
          <button
            onClick={goToNextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) =>
              day === null ? (
                <div key={i} />
              ) : (
                <div
                  key={i}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium ${
                    entriesByDay.has(day) ? 'bg-red-100 text-red-700' : 'text-gray-600'
                  }`}
                >
                  {day}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-sm mt-4">
        {loading ? null : sortedEntries.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-4">Sin reservaciones este mes.</p>
        ) : (
          <div className="space-y-2">
            {sortedEntries.map((e, i) => (
              // key incluye el índice: dos reservaciones (p. ej. una vieja
              // ya deposito-devuelto y una nueva) podrían caer en la misma
              // fecha si la primera dejó de ocupar el recurso antes de que
              // se creara la segunda — `date` solo no es único.
              <div
                key={`${e.date}-${i}`}
                className="bg-white rounded-xl px-4 py-2.5 shadow-sm flex items-center gap-3"
              >
                <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 text-red-700 text-sm font-semibold">
                  {e.date.slice(-2)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 truncate">{e.name}</p>
                  <p className="text-xs text-gray-400 truncate">{e.address}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

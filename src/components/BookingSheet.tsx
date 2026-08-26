import { useState } from 'react'
import { formatDateLong, formatTime, addHours } from '@/utils/time'

interface Props {
  date: string
  startTime: string
  availableDurations: number[]
  onConfirm: (durationHours: number) => Promise<void>
  onClose: () => void
}

export default function BookingSheet({ date, startTime, availableDurations, onConfirm, onClose }: Props) {
  const [duration, setDuration] = useState(availableDurations[0])
  const [loading, setLoading] = useState(false)
  const endTime = addHours(startTime, duration)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm(duration)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-6 pt-5 pb-8 max-w-lg mx-auto">
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Reservar cancha</h2>
            <p className="text-sm text-gray-500 mt-0.5">{formatDateLong(date)}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Time display */}
        <div className="bg-brand-50 rounded-2xl p-4 mb-5 text-center">
          <p className="text-3xl font-bold text-brand-700">
            {formatTime(startTime)}
          </p>
          <p className="text-sm text-brand-500 mt-1">
            hasta {formatTime(endTime)}
          </p>
        </div>

        {/* Duration selector */}
        <p className="text-sm font-medium text-gray-700 mb-3">¿Cuántas horas?</p>
        <div className="flex gap-3 mb-6">
          {availableDurations.map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition border ${
                duration === d
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
              }`}
            >
              {d}h
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl py-4 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            `Confirmar · ${formatTime(startTime)} - ${formatTime(endTime)}`
          )}
        </button>
      </div>
    </>
  )
}

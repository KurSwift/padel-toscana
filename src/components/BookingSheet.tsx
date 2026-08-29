import { useState } from 'react'
import { formatDateLong, formatTime, addHours, toDate, formatDateTimeShort } from '@/utils/time'
import { computePaymentDueAt, MIN_PLAYER_COUNT, MAX_PLAYER_COUNT } from '@/services/reservationRules'

interface Props {
  date: string
  startTime: string
  availableDurations: number[]
  defaultResidentName: string
  reservationFee: number
  paymentDeadlineHours: number
  onConfirm: (params: {
    durationHours: number
    playerCount: number
    residentInChargeName: string
  }) => Promise<void>
  onClose: () => void
}

const DEFAULT_PLAYER_COUNT = 4

export default function BookingSheet({
  date,
  startTime,
  availableDurations,
  defaultResidentName,
  reservationFee,
  paymentDeadlineHours,
  onConfirm,
  onClose,
}: Props) {
  const [duration, setDuration] = useState(availableDurations[0])
  const [playerCount, setPlayerCount] = useState(DEFAULT_PLAYER_COUNT)
  const [residentInChargeName, setResidentInChargeName] = useState(defaultResidentName)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const endTime = addHours(startTime, duration)

  const residentNameValid = residentInChargeName.trim().length > 0

  async function handleConfirm() {
    if (!residentNameValid) return
    setLoading(true)
    try {
      await onConfirm({ durationHours: duration, playerCount, residentInChargeName })
      setConfirmed(true)
    } catch {
      // El toast de error y el cierre del sheet ya los maneja el caller
      // (HomePage) — aquí solo evitamos pasar a la pantalla de éxito.
    } finally {
      setLoading(false)
    }
  }

  if (confirmed) {
    const paymentDueAt = computePaymentDueAt(toDate(date, startTime), paymentDeadlineHours)
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-6 pt-5 pb-8 max-w-lg mx-auto">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
          <div className="text-center mb-5">
            <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">¡Reservación creada!</h2>
            <p className="text-sm text-gray-500 mt-1">
              {formatDateLong(date)} · {formatTime(startTime)} – {formatTime(endTime)}
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-center">
            <p className="text-sm text-amber-800">
              Paga <span className="font-bold">${reservationFee}</span> al tesorero antes de
            </p>
            <p className="text-base font-bold text-amber-900 mt-0.5">
              {formatDateTimeShort(paymentDueAt)}
            </p>
            <p className="text-xs text-amber-700 mt-2">
              Si no se confirma el pago antes de esa fecha, el horario se libera automáticamente.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl py-4 transition"
          >
            Entendido
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-6 pt-5 pb-8 max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
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

        {/* Player count */}
        <p className="text-sm font-medium text-gray-700 mb-1">¿Cuántos jugadores en total?</p>
        <p className="text-xs text-gray-400 mb-3">En cancha caben 4 a la vez — el resto son suplentes/acompañantes.</p>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setPlayerCount((n) => Math.max(MIN_PLAYER_COUNT, n - 1))}
            disabled={playerCount <= MIN_PLAYER_COUNT}
            className="w-11 h-11 rounded-xl border border-gray-300 text-gray-600 text-lg font-semibold disabled:opacity-30 hover:border-brand-400 transition"
          >
            −
          </button>
          <span className="text-2xl font-bold text-gray-900 w-10 text-center">{playerCount}</span>
          <button
            onClick={() => setPlayerCount((n) => Math.min(MAX_PLAYER_COUNT, n + 1))}
            disabled={playerCount >= MAX_PLAYER_COUNT}
            className="w-11 h-11 rounded-xl border border-gray-300 text-gray-600 text-lg font-semibold disabled:opacity-30 hover:border-brand-400 transition"
          >
            +
          </button>
        </div>

        {/* Resident in charge */}
        <label className="block mb-6">
          <span className="text-sm font-medium text-gray-700 mb-2 block">Residente a cargo</span>
          <input
            type="text"
            value={residentInChargeName}
            onChange={(e) => setResidentInChargeName(e.target.value)}
            placeholder="Nombre del residente a cargo"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <button
          onClick={handleConfirm}
          disabled={loading || !residentNameValid}
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

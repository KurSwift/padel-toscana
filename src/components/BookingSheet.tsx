import { useState } from 'react'
import { CourtType } from '@/types'
import { formatDateLong, formatTime, addHours, toDate, formatDateTimeShort } from '@/utils/time'
import { computePaymentDueAt, MIN_PLAYER_COUNT } from '@/services/reservationRules'

interface Props {
  courtType: CourtType
  date: string
  startTime: string
  availableDurations: number[]
  maxPlayerCount: number
  defaultResidentName: string
  reservationFee: number
  paymentDeadlineHours: number
  // Exclusivos de casa club (issue 1/8 del épico #60) — undefined en
  // cancha, que no tiene depósito.
  depositAmount?: number
  depositRefundableAmount?: number
  onConfirm: (params: {
    durationHours: number
    playerCount: number
    residentInChargeName: string
  }) => Promise<void>
  onClose: () => void
}

const DEFAULT_PLAYER_COUNT = 4

// Reservar cancha (horario/duración a elegir) y reservar casa club (día
// completo fijo, issue 2/8 del épico #60) comparten casi todo el flujo —
// confirmación, residente a cargo, aviso de pago — así que este componente
// se volvió consciente de courtType (issue 6/8) en vez de forkearse en dos.
// La única pieza exclusiva de cancha es el selector de duración: casa club
// no elige horas, durationHours ya viene fijo en availableDurations[0]
// (el caller, HomePage, pasa [court.settings.minDurationHours]).
export default function BookingSheet({
  courtType,
  date,
  startTime,
  availableDurations,
  maxPlayerCount,
  defaultResidentName,
  reservationFee,
  paymentDeadlineHours,
  depositAmount,
  depositRefundableAmount,
  onConfirm,
  onClose,
}: Props) {
  const isCasaClub = courtType === 'casa-club'
  const [duration, setDuration] = useState(availableDurations[0])
  const [playerCount, setPlayerCount] = useState(Math.min(DEFAULT_PLAYER_COUNT, maxPlayerCount))
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
      <SheetFrame labelledBy="booking-success-title" onClose={onClose}>
        <div className="px-5 pb-5 pt-2 text-center">
          <div aria-hidden="true" className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-2xl font-semibold text-brand-700">✓</div>
          <h2 id="booking-success-title" className="text-xl font-bold tracking-tight text-gray-900">¡Reservación creada!</h2>
          <p className="mt-1 text-sm text-gray-500">
            {isCasaClub ? formatDateLong(date) : `${formatDateLong(date)} · ${formatTime(startTime)} – ${formatTime(endTime)}`}
          </p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Siguiente paso</p>
            <p className="mt-1 text-sm text-amber-900">Paga <span className="font-bold">${reservationFee}</span> al tesorero antes de</p>
            <p className="mt-1 text-base font-bold text-amber-950">{formatDateTimeShort(paymentDueAt)}</p>
            {isCasaClub && depositRefundableAmount != null && (
              <p className="mt-3 text-xs leading-5 text-amber-800">
                ${depositRefundableAmount} de ese depósito se te devuelve después del evento, salvo que se retenga por daños o incumplimiento.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-amber-800">
              Si no se confirma el pago antes de esa fecha, {isCasaClub ? 'la fecha se libera' : 'el horario se libera'} automáticamente.
            </p>
          </div>
          <button type="button" onClick={onClose} className="mt-6 min-h-12 w-full rounded-xl bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700">Entendido</button>
        </div>
      </SheetFrame>
    )
  }

  return (
    <SheetFrame labelledBy="booking-title" onClose={onClose}>
      <header className="flex items-start justify-between border-b border-gray-100 px-5 pb-4 pt-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Nueva reservación</p>
          <h2 id="booking-title" className="mt-1 text-xl font-bold tracking-tight text-gray-900">{isCasaClub ? 'Casa Club' : 'Cancha'}</h2>
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200">✕</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <section aria-label="Resumen de reservación" className="rounded-2xl bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-900">{formatDateLong(date)}</p>
          {isCasaClub ? (
            <p className="mt-1 text-xl font-bold text-brand-700">Día completo</p>
          ) : (
            <p className="mt-1 text-xl font-bold text-brand-700">{formatTime(startTime)} – {formatTime(endTime)}</p>
          )}
        </section>

        {/* Duration selector — exclusivo de cancha, casa club es 24h fijo */}
        {!isCasaClub && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">¿Cuántas horas?</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {availableDurations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  aria-pressed={duration === d}
                  className={`min-h-12 rounded-xl border text-sm font-semibold transition ${
                    duration === d
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                  }`}
                >
                  {d}h
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Player count */}
        <section className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900">
          {isCasaClub ? '¿Cuántos invitados en total?' : '¿Cuántos jugadores en total?'}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {isCasaClub
            ? `Hasta ${maxPlayerCount} personas.`
            : 'En cancha caben 4 a la vez — el resto son suplentes/acompañantes.'}
        </p>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-2">
          <button
            type="button"
            onClick={() => setPlayerCount((n) => Math.max(MIN_PLAYER_COUNT, n - 1))}
            disabled={playerCount <= MIN_PLAYER_COUNT}
            className="grid h-11 w-11 place-items-center rounded-xl bg-gray-100 text-lg font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-30"
          >
            −
          </button>
          <span className="text-2xl font-bold text-gray-900">{playerCount}</span>
          <button
            type="button"
            onClick={() => setPlayerCount((n) => Math.min(maxPlayerCount, n + 1))}
            disabled={playerCount >= maxPlayerCount}
            className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-lg font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-30"
          >
            +
          </button>
        </div>
        </section>

        {/* Resident in charge */}
        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-semibold text-gray-900">Residente a cargo</span>
          <input
            type="text"
            value={residentInChargeName}
            onChange={(e) => setResidentInChargeName(e.target.value)}
            placeholder="Nombre del residente a cargo"
            className="min-h-12 w-full rounded-xl border border-gray-300 px-4 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500"
          />
        </label>

        {/* Aviso de depósito — exclusivo de casa club, antes de confirmar */}
        {isCasaClub && depositAmount != null && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Depósito de <span className="font-bold">${depositAmount}</span> al confirmar.
              {depositRefundableAmount != null && (
                <> ${depositRefundableAmount} son reembolsables después del evento.</>
              )}
            </p>
          </div>
        )}
      </div>
      <footer className="border-t border-gray-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || !residentNameValid}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isCasaClub ? (
            'Confirmar reservación'
          ) : (
            `Confirmar · ${formatTime(startTime)} - ${formatTime(endTime)}`
          )}
        </button>
      </footer>
    </SheetFrame>
  )
}

/** Marco compartido para las hojas móviles de reservación y confirmación. */
function SheetFrame({ children, labelledBy, onClose }: {
  children: React.ReactNode
  labelledBy: string
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="fixed inset-0 z-40 flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-4">
      <button type="button" aria-label="Cerrar hoja de reservación" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div aria-hidden="true" className="mx-auto my-3 h-1 w-10 shrink-0 rounded-full bg-gray-200" />
        {children}
      </div>
    </div>
  )
}

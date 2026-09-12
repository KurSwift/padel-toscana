import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Court, Reservation } from '@/types'
import { getAllCourts } from '@/services/courts'
import {
  subscribeToPendingPayments,
  confirmPayment,
  subscribeToPendingDepositDecisions,
  returnDeposit,
  retainDeposit,
} from '@/services/reservations'
import { formatDateShort, formatTime } from '@/utils/time'
import { trackAnalyticsEvent } from '@/services/analytics'
import { useAuth } from '@/context/AuthContext'

export default function TesoreroPage() {
  const { profile } = useAuth()
  const [courts, setCourts] = useState<Court[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [depositReservations, setDepositReservations] = useState<Reservation[]>([])
  const [decidingDeposit, setDecidingDeposit] = useState<string | null>(null)

  useEffect(() => {
    getAllCourts().then(setCourts)
  }, [])

  useEffect(() => {
    return subscribeToPendingPayments((r) => {
      setReservations(
        [...r].sort((a, b) => a.paymentDueAt.toMillis() - b.paymentDueAt.toMillis()),
      )
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    return subscribeToPendingDepositDecisions((r) => {
      setDepositReservations([...r].sort((a, b) => a.date.localeCompare(b.date)))
    })
  }, [])

  async function handleConfirm(r: Reservation) {
    setConfirming(r.id)
    try {
      await confirmPayment(r.id)
      trackAnalyticsEvent('payment_confirmed', { resource_type: r.courtType ?? 'cancha', role: profile?.role, stage: 'payment' })
      toast.success(`Pago de ${r.userName.split(' ')[0]} confirmado.`)
    } catch {
      toast.error('No se pudo confirmar el pago.')
    } finally {
      setConfirming(null)
    }
  }

  async function handleDeposit(r: Reservation, decision: 'devolver' | 'retener') {
    setDecidingDeposit(r.id)
    try {
      if (decision === 'devolver') {
        await returnDeposit(r.id)
        toast.success(`Depósito de ${r.userName.split(' ')[0]} devuelto.`)
      } else {
        await retainDeposit(r.id)
        toast.success(`Depósito de ${r.userName.split(' ')[0]} retenido.`)
      }
    } catch {
      toast.error('No se pudo registrar la decisión del depósito.')
    } finally {
      setDecidingDeposit(null)
    }
  }

  function courtName(courtId: string) {
    return courts.find((c) => c.id === courtId)?.name ?? 'Cancha'
  }

  function depositRefundableAmount(courtId: string) {
    return courts.find((c) => c.id === courtId)?.settings.depositRefundableAmount
  }

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-6 pb-24 md:px-8 md:pb-8">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Pagos</h2>
        <p className="mt-1 text-sm text-gray-500">Confirma pagos y resuelve depósitos pendientes.</p>
        <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reservations.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No hay pagos pendientes de confirmar.</p>
        ) : (
          <div className="space-y-2">
            {reservations.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {formatDateShort(r.date)} ·{' '}
                    {(r.courtType ?? 'cancha') === 'casa-club'
                      ? 'Día completo'
                      : `${formatTime(r.startTime)} – ${formatTime(r.endTime)}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{courtName(r.courtId)}</p>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <span>{r.residentInChargeName}</span>
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">
                      {r.userAddress}
                    </span>
                    <span className="text-gray-400">
                      · {r.playerCount} {(r.courtType ?? 'cancha') === 'casa-club' ? 'personas' : 'jugadores'}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleConfirm(r)}
                  disabled={confirming === r.id}
                  className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition disabled:opacity-40"
                >
                  {confirming === r.id ? '...' : 'Confirmar pago'}
                </button>
              </div>
            ))}
          </div>
        )}

        {depositReservations.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-6 mb-2">
              Depósitos por resolver
            </h2>
            <div className="space-y-2">
              {depositReservations.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-gray-800">{formatDateShort(r.date)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{courtName(r.courtId)}</p>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <span>{r.residentInChargeName}</span>
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">
                      {r.userAddress}
                    </span>
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDeposit(r, 'devolver')}
                      disabled={decidingDeposit === r.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition disabled:opacity-40"
                    >
                      {decidingDeposit === r.id
                        ? '...'
                        : `Devolver depósito ($${depositRefundableAmount(r.courtId) ?? '—'})`}
                    </button>
                    <button
                      onClick={() => handleDeposit(r, 'retener')}
                      disabled={decidingDeposit === r.id}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition disabled:opacity-40"
                    >
                      {decidingDeposit === r.id ? '...' : 'Retener depósito'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </main>
  )
}

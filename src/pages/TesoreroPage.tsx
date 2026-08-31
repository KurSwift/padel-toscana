import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { Court, Reservation } from '@/types'
import { getAllCourts } from '@/services/courts'
import { subscribeToPendingPayments, confirmPayment } from '@/services/reservations'
import { formatDateShort, formatTime } from '@/utils/time'
import Header from '@/components/Header'

export default function TesoreroPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [courts, setCourts] = useState<Court[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)

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

  async function handleConfirm(r: Reservation) {
    setConfirming(r.id)
    try {
      await confirmPayment(r.id)
      toast.success(`Pago de ${r.userName.split(' ')[0]} confirmado.`)
    } catch {
      toast.error('No se pudo confirmar el pago.')
    } finally {
      setConfirming(null)
    }
  }

  function courtName(courtId: string) {
    return courts.find((c) => c.id === courtId)?.name ?? 'Cancha'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Pagos pendientes" subtitle={profile?.name}>
        <button
          onClick={() => navigate('/ayuda')}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
        >
          Ayuda
        </button>
        <button
          onClick={() => navigate('/')}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition"
        >
          ← Volver
        </button>
      </Header>

      <main className="max-w-lg mx-auto px-4 py-5">
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
                    {formatDateShort(r.date)} · {formatTime(r.startTime)} – {formatTime(r.endTime)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{courtName(r.courtId)}</p>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <span>{r.residentInChargeName}</span>
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">
                      {r.userAddress}
                    </span>
                    <span className="text-gray-400">· {r.playerCount} jugadores</span>
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
      </main>
    </div>
  )
}

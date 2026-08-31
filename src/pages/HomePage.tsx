import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { useCourtData } from '@/hooks/useCourtData'
import { createReservation, reservationErrorMessage } from '@/services/reservations'
import { signOut } from '@/services/auth'
import DateSelector from '@/components/DateSelector'
import SlotsGrid from '@/components/SlotsGrid'
import BookingSheet from '@/components/BookingSheet'
import MyReservations from '@/components/MyReservations'
import { todayString } from '@/utils/time'

interface SelectedSlot {
  startTime: string
  availableDurations: number[]
}

export default function HomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [view, setView] = useState<'slots' | 'reservations'>('slots')

  const { court, reservations, userReservations, loading } = useCourtData(
    user?.uid ?? '',
    selectedDate,
  )

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // No cierra el sheet al confirmar con éxito — BookingSheet se queda
  // abierto mostrando el aviso de pago (monto + fecha límite) hasta que el
  // usuario lo cierre explícitamente. Solo lo cerramos aquí si falla.
  async function handleConfirmBooking(params: {
    durationHours: number
    playerCount: number
    residentInChargeName: string
  }) {
    if (!court || !user || !profile || !selectedSlot) return
    try {
      await createReservation({
        court,
        userId: user.uid,
        userName: profile.name,
        userAddress: profile.address,
        date: selectedDate,
        startTime: selectedSlot.startTime,
        ...params,
      })
    } catch (err) {
      toast.error(reservationErrorMessage((err as Error).message))
      setSelectedSlot(null)
      throw err
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!court) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-50 px-4">
        <div className="text-center">
          <p className="text-gray-500">No hay canchas disponibles por el momento.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-brand-700">Padel Toscana</h1>
          <p className="text-xs text-gray-500">Hola, {profile?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {(profile?.role === 'admin' || profile?.role === 'super-admin') && (
            <button
              onClick={() => navigate('/admin')}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition"
            >
              Admin
            </button>
          )}
          {(profile?.role === 'tesorero' || profile?.role === 'admin' || profile?.role === 'super-admin') && (
            <button
              onClick={() => navigate('/tesorero')}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition"
            >
              Pagos
            </button>
          )}
          <button
            onClick={() => navigate('/ayuda')}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            Ayuda
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="sticky top-[65px] z-10 bg-white border-b border-gray-200 flex">
        {(['slots', 'reservations'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`relative flex-1 py-3 text-sm font-medium transition border-b-2 ${
              view === v
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {v === 'slots' ? 'Horarios' : 'Mis reservaciones'}
            {v === 'reservations' && userReservations.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-brand-600 text-white text-[10px] font-bold rounded-full leading-none">
                {userReservations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {view === 'slots' ? (
          <>
            {/* Court name */}
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-800">{court.name}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {court.settings.openTime} – {court.settings.closeTime}
              </span>
            </div>

            {/* Date selector */}
            <DateSelector
              date={selectedDate}
              maxDaysAhead={court.settings.daysAheadAllowed}
              onChange={setSelectedDate}
            />

            {/* Slots */}
            <SlotsGrid
              court={court}
              reservations={reservations}
              selectedDate={selectedDate}
              userId={user?.uid ?? ''}
              onSelectSlot={(startTime, durations) =>
                setSelectedSlot({ startTime, availableDurations: durations })
              }
            />
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Mis reservaciones
            </h2>
            <MyReservations
              reservations={userReservations}
              courtName={court.name}
            />
          </>
        )}
      </main>

      {/* Booking bottom sheet */}
      {selectedSlot && profile && (
        <BookingSheet
          date={selectedDate}
          startTime={selectedSlot.startTime}
          availableDurations={selectedSlot.availableDurations}
          defaultResidentName={profile.name}
          reservationFee={court.settings.reservationFee}
          paymentDeadlineHours={court.settings.paymentDeadlineHours}
          onConfirm={handleConfirmBooking}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  )
}

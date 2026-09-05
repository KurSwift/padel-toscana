import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CourtType } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useSiteSettings } from '@/context/SiteSettingsContext'
import { useCourtData } from '@/hooks/useCourtData'
import { createReservation, reservationErrorMessage } from '@/services/reservations'
import { signOut } from '@/services/auth'
import DateSelector from '@/components/DateSelector'
import SlotsGrid from '@/components/SlotsGrid'
import CasaClubAvailability from '@/components/CasaClubAvailability'
import BookingSheet from '@/components/BookingSheet'
import MyReservations from '@/components/MyReservations'
import Header from '@/components/Header'
import { todayString } from '@/utils/time'

interface SelectedSlot {
  startTime: string
  availableDurations: number[]
}

const RESOURCE_LABELS: Record<CourtType, string> = {
  cancha: '🏓 Cancha',
  'casa-club': '🏠 Casa Club',
}

export default function HomePage() {
  const { user, profile } = useAuth()
  const { siteName } = useSiteSettings()
  const navigate = useNavigate()
  const [resourceType, setResourceType] = useState<CourtType>('cancha')
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [view, setView] = useState<'slots' | 'reservations'>('slots')

  const { court, reservations, userReservations, loading } = useCourtData(
    user?.uid ?? '',
    resourceType,
    selectedDate,
  )

  const isCasaClub = resourceType === 'casa-club'

  function handleSelectResource(type: CourtType) {
    setResourceType(type)
    // Una fecha válida para el recurso anterior podría no serlo para el
    // nuevo (daysAheadAllowed distinto — 7 en cancha, 90 en casa club) —
    // vuelve a "hoy" para no arrancar en un estado raro. También cierra
    // cualquier sheet de reserva abierto del recurso anterior.
    setSelectedDate(todayString())
    setSelectedSlot(null)
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={siteName} titleClassName="text-brand-700" subtitle={`Hola, ${profile?.name}`} sticky>
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
      </Header>

      {/* Resource selector — Cancha / Casa Club (issue 6/8 del épico #60) */}
      <div className="sticky top-[65px] z-10 bg-white border-b border-gray-200 flex gap-2 px-4 py-2">
        {(['cancha', 'casa-club'] as const).map((type) => (
          <button
            key={type}
            onClick={() => handleSelectResource(type)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
              resourceType === type
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {RESOURCE_LABELS[type]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !court ? (
        <div className="flex items-center justify-center py-20 px-4">
          <p className="text-gray-500 text-center">
            {isCasaClub ? 'La Casa Club no está disponible todavía.' : 'No hay canchas disponibles por el momento.'}
          </p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="sticky top-[113px] z-10 bg-white border-b border-gray-200 flex">
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
                    {isCasaClub ? 'Día completo' : `${court.settings.openTime} – ${court.settings.closeTime}`}
                  </span>
                </div>

                {/* Date selector */}
                <DateSelector
                  date={selectedDate}
                  maxDaysAhead={court.settings.daysAheadAllowed}
                  onChange={setSelectedDate}
                />

                {/* Disponibilidad: grilla de horarios (cancha) o bloque de
                    día completo (casa club, issue 2/8 del épico #60) */}
                {isCasaClub ? (
                  <CasaClubAvailability
                    reservations={reservations}
                    userId={user?.uid ?? ''}
                    onReserve={() =>
                      setSelectedSlot({
                        startTime: court.settings.openTime,
                        availableDurations: [court.settings.minDurationHours],
                      })
                    }
                  />
                ) : (
                  <SlotsGrid
                    court={court}
                    reservations={reservations}
                    selectedDate={selectedDate}
                    userId={user?.uid ?? ''}
                    onSelectSlot={(startTime, durations) =>
                      setSelectedSlot({ startTime, availableDurations: durations })
                    }
                  />
                )}
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Mis reservaciones
                </h2>
                <MyReservations
                  reservations={userReservations}
                  court={court}
                />
              </>
            )}
          </main>

          {/* Booking bottom sheet */}
          {selectedSlot && profile && (
            <BookingSheet
              courtType={court.type ?? 'cancha'}
              date={selectedDate}
              startTime={selectedSlot.startTime}
              availableDurations={selectedSlot.availableDurations}
              maxPlayerCount={court.settings.maxPlayerCount ?? 10}
              defaultResidentName={profile.name}
              reservationFee={court.settings.reservationFee}
              paymentDeadlineHours={court.settings.paymentDeadlineHours}
              depositAmount={court.settings.depositAmount}
              depositRefundableAmount={court.settings.depositRefundableAmount}
              onConfirm={handleConfirmBooking}
              onClose={() => setSelectedSlot(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

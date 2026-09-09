import { useState } from 'react'
import toast from 'react-hot-toast'
import { CourtType } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { useCourtData } from '@/hooks/useCourtData'
import { createReservation, reservationErrorMessage } from '@/services/reservations'
import DateSelector from '@/components/DateSelector'
import SlotsGrid from '@/components/SlotsGrid'
import CasaClubAvailability from '@/components/CasaClubAvailability'
import BookingSheet from '@/components/BookingSheet'
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
  const [resourceType, setResourceType] = useState<CourtType>('cancha')
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)

  const { court, reservations, loading } = useCourtData(
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
      toast.error(reservationErrorMessage((err as Error).message, court.settings.minLeadHours))
      setSelectedSlot(null)
      throw err
    }
  }

  return (
    <div className="min-h-full pb-20 md:pb-0">
      {/* Resource selector — Cancha / Casa Club (issue 6/8 del épico #60) */}
      <div className="sticky top-[61px] z-10 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:top-[61px] md:px-8">
        <div className="mx-auto flex max-w-5xl gap-2">
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
          <main className="mx-auto max-w-5xl px-4 py-5 md:px-8">
            <div className="max-w-lg space-y-5">
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
            </div>
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

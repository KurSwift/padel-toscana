import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CourtType, UserProfile } from '@/types'
import { useCourtData } from '@/hooks/useCourtData'
import { createReservation, reservationErrorMessage } from '@/services/reservations'
import { firstReservableDate } from '@/services/reservationRules'
import { trackAnalyticsEvent } from '@/services/analytics'
import DateSelector from '@/components/DateSelector'
import SlotsGrid from '@/components/SlotsGrid'
import CasaClubAvailability from '@/components/CasaClubAvailability'
import CasaClubMonthCalendar from '@/components/CasaClubMonthCalendar'
import BookingSheet from '@/components/BookingSheet'
import { addDays, todayString } from '@/utils/time'

interface SelectedSlot {
  startTime: string
  availableDurations: number[]
}

const RESOURCE_LABELS: Record<CourtType, string> = {
  cancha: 'Cancha',
  'casa-club': 'Casa Club',
}

/** Calendario compartido: reserva propia o para el colono elegido por administración. */
export default function ReservationCalendar({ profile, forResident = false }: {
  profile: UserProfile
  forResident?: boolean
}) {
  const [resourceType, setResourceType] = useState<CourtType>('cancha')
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)

  const { court, reservations, loading, reservationsLoading, error, retry } = useCourtData(
    profile.uid,
    resourceType,
    selectedDate,
  )

  const isCasaClub = resourceType === 'casa-club'
  const firstBookableDate = court
    ? firstReservableDate(new Date(), court.settings.openTime, court.settings.minLeadHours)
    : todayString()

  useEffect(() => {
    // Al cambiar de recurso, una fecha que era válida para cancha puede no
    // cumplir la anticipación de Casa Club. La UI siempre aterriza en la
    // primera fecha que el servidor aceptaría.
    if (selectedDate < firstBookableDate) {
      setSelectedDate(firstBookableDate)
      setSelectedSlot(null)
    }
  }, [firstBookableDate, selectedDate])

  /** Cambia recurso, reinicia fecha y descarta una selección anterior. */
  function handleSelectResource(type: CourtType) {
    trackAnalyticsEvent('resource_selected', { resource_type: type, role: profile.role, stage: 'booking' })
    setResourceType(type)
    // Una fecha válida para el recurso anterior podría no serlo para el
    // nuevo (días y anticipación mínima distintos) — el efecto de arriba la
    // ajusta a la primera fecha reservable. También cierra cualquier sheet
    // de reserva abierto del recurso anterior.
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
    if (!court || !selectedSlot) throw new Error('booking-unavailable')
    const analyticsParams = { resource_type: resourceType, role: profile.role, stage: 'booking' as const }
    trackAnalyticsEvent('reservation_started', analyticsParams)
    try {
      await createReservation({
        court,
        ...(forResident ? { targetUserId: profile.uid } : {}),
        date: selectedDate,
        startTime: selectedSlot.startTime,
        ...params,
      })
      trackAnalyticsEvent('reservation_created', { ...analyticsParams, result: 'success' })
    } catch (err) {
      trackAnalyticsEvent('reservation_failed', { ...analyticsParams, result: 'error', error_code: (err as Error).message })
      toast.error(reservationErrorMessage((err as Error).message, court.settings.minLeadHours))
      setSelectedSlot(null)
      throw err
    }
  }

  return (
    <div className="min-h-full pb-20 md:pb-0">
      <div className={forResident ? 'py-4' : 'mx-auto max-w-5xl px-4 py-6 md:px-8'}>
        <div className="max-w-lg space-y-6">
          <section aria-labelledby="calendar-title">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Reservar</p>
            <h2 id="calendar-title" className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{forResident ? 'Disponibilidad' : 'Calendario'}</h2>
            <p className="mt-1 text-sm text-gray-500">Elige el recurso y consulta su disponibilidad.</p>
            <ResourceSegmentedControl value={resourceType} onChange={handleSelectResource} />
          </section>

          {error ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <p className="text-sm text-gray-500">No se pudo cargar la disponibilidad.</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 min-h-11 rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100"
              >
                Reintentar
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !court ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <p className="text-sm text-gray-500">
                {isCasaClub ? 'La Casa Club no está disponible todavía.' : 'No hay canchas disponibles por el momento.'}
              </p>
            </div>
          ) : (
            <>
              {/* Court name */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-base font-semibold text-gray-800">{court.name}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {isCasaClub ? 'Día completo' : `${court.settings.openTime} – ${court.settings.closeTime}`}
                </span>
              </div>

              {isCasaClub ? (
                <CasaClubMonthCalendar
                  courtId={court.id}
                  selectedDate={selectedDate}
                  minDate={firstBookableDate}
                  maxDate={addDays(todayString(), court.settings.daysAheadAllowed)}
                  onChange={setSelectedDate}
                />
              ) : (
                <DateSelector
                  date={selectedDate}
                  minDate={firstBookableDate}
                  maxDaysAhead={court.settings.daysAheadAllowed}
                  onChange={setSelectedDate}
                />
              )}

              {/* Disponibilidad: grilla de horarios (cancha) o bloque de
                  día completo (casa club, issue 2/8 del épico #60) */}
              {reservationsLoading ? (
                <div className="flex min-h-[88px] items-center justify-center rounded-2xl bg-gray-50 text-sm text-gray-500" role="status">
                  Cargando disponibilidad…
                </div>
              ) : isCasaClub ? (
                <CasaClubAvailability
                  reservations={reservations}
                  userId={profile.uid}
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
                  userId={profile.uid}
                  onSelectSlot={(startTime, durations) =>
                    setSelectedSlot({ startTime, availableDurations: durations })
                  }
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Booking bottom sheet */}
      {selectedSlot && profile && court && (
        <BookingSheet
          courtType={court.type ?? 'cancha'}
          date={selectedDate}
          startTime={selectedSlot.startTime}
          availableDurations={selectedSlot.availableDurations}
          maxPlayerCount={court.settings.maxPlayerCount ?? 10}
          defaultResidentName={profile.name}
          beneficiary={forResident ? `${profile.name} · ${profile.address}` : undefined}
          reservationFee={court.settings.reservationFee}
          paymentDeadlineHours={court.settings.paymentDeadlineHours}
          depositAmount={court.settings.depositAmount}
          depositRefundableAmount={court.settings.depositRefundableAmount}
          onConfirm={handleConfirmBooking}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  )
}

/** Selector segmentado accesible para alternar el recurso del calendario. */
function ResourceSegmentedControl({ value, onChange }: {
  value: CourtType
  onChange: (type: CourtType) => void
}) {
  return (
    <div role="tablist" aria-label="Recurso a reservar" className="mt-5 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
      {(['cancha', 'casa-club'] as const).map((type) => {
        const selected = value === type
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(type)}
            className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition ${
              selected
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {RESOURCE_LABELS[type]}
          </button>
        )
      })}
    </div>
  )
}

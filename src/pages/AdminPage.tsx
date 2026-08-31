import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { Court, CourtSettings, UserProfile, UserRole, Reservation, ReservationStatus, ValidStreet, VALID_STREETS } from '@/types'
import { getAllCourts, updateCourtSettings, toggleCourtActive, createCourt, DEFAULT_COURT_SETTINGS } from '@/services/courts'
import { getAllUsers, setUserRole, approveUser, rejectUser, adminCreateColono, adminCreateColonoErrorMessage, deleteColono, deleteColonoErrorMessage } from '@/services/users'
import { canAssignRole, canActOnUser } from '@/services/userRules'
import { uploadLogo, getLogoUrl, uploadLogoErrorMessage } from '@/services/branding'
import { setThemePalette } from '@/services/theme'
import { updateSiteSettings, updateSiteSettingsErrorMessage } from '@/services/siteSettings'
import { useTheme } from '@/context/ThemeContext'
import { useSiteSettings } from '@/context/SiteSettingsContext'
import { PALETTES } from '@/theme/palettes'
import { isValidLogoFile } from '@/services/brandingRules'
import { MAX_RESERVATION_DURATION_HOURS } from '@/services/reservationRules'
import { subscribeToAllReservationsByDate, setReservationStatus } from '@/services/reservations'
import { todayString, addDays, formatDateLong, formatTime } from '@/utils/time'
import StatusBadge, { RESERVATION_STATUS_LABELS } from '@/components/StatusBadge'
import Header from '@/components/Header'

type Tab = 'reservations' | 'courts' | 'users' | 'avanzado'

// Etiquetas de rol, compartidas entre UsersTab (solo lectura) y AdvancedTab
// (donde sí se puede editar — asignar rol es exclusivo de super-admin, Epic
// #43, ver AdvancedTab más abajo).
const ROLE_LABELS: Record<UserRole, string> = {
  colono: 'Colono',
  admin: 'Admin',
  tesorero: 'Tesorero',
  'super-admin': 'Super Admin',
}

const TAB_LABELS: Record<Tab, string> = {
  reservations: 'Reservaciones',
  courts: 'Canchas',
  users: 'Usuarios',
  avanzado: 'Avanzado',
}

export default function AdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('reservations')
  const [pendingCount, setPendingCount] = useState(0)
  const isSuperAdmin = profile?.role === 'super-admin'
  const tabs: Tab[] = isSuperAdmin
    ? ['reservations', 'courts', 'users', 'avanzado']
    : ['reservations', 'courts', 'users']

  useEffect(() => {
    getAllUsers().then((users) =>
      setPendingCount(users.filter((u) => u.status === 'pending').length),
    )
  }, [tab])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Panel Admin" subtitle={profile?.name}>
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

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition border-b-2 relative ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[t]}
            {t === 'users' && pendingCount > 0 && (
              <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 py-5">
        {tab === 'reservations' && <ReservationsTab />}
        {tab === 'courts' && <CourtsTab />}
        {tab === 'users' && <UsersTab onPendingChange={setPendingCount} />}
        {tab === 'avanzado' && isSuperAdmin && <AdvancedTab />}
      </main>
    </div>
  )
}

// ── Reservations Tab ───────────────────────────────────────────────────────────

function ReservationsTab() {
  const [date, setDate] = useState(todayString())
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [changing, setChanging] = useState<string | null>(null)

  useEffect(() => {
    return subscribeToAllReservationsByDate(date, (r) =>
      setReservations([...r].sort((a, b) => a.startTime.localeCompare(b.startTime))),
    )
  }, [date])

  async function handleChangeStatus(r: Reservation, status: ReservationStatus) {
    if (status === r.status) return
    setChanging(r.id)
    try {
      await setReservationStatus(r.id, status)
      setReservations((prev) => prev.map((x) => x.id === r.id ? { ...x, status } : x))
      toast.success(`Reservación de ${r.userName.split(' ')[0]} actualizada a "${RESERVATION_STATUS_LABELS[status]}".`)
    } catch {
      toast.error('No se pudo cambiar el status.')
    } finally {
      setChanging(null)
    }
  }

  const today = todayString()

  return (
    <div className="space-y-4">
      {/* Date nav */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition"
        >
          ‹
        </button>
        <span className="font-semibold text-gray-800 text-sm">
          {date === today ? 'Hoy' : formatDateLong(date)}
        </span>
        <button
          onClick={() => setDate(addDays(date, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition"
        >
          ›
        </button>
      </div>

      {reservations.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">Sin reservaciones este día.</p>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">
                    {formatTime(r.startTime)} – {formatTime(r.endTime)}
                  </p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <span>{r.userName.split(' ')[0]}</span>
                  <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">
                    {r.userAddress}
                  </span>
                </p>
              </div>
              <select
                value={r.status}
                onChange={(e) => handleChangeStatus(r, e.target.value as ReservationStatus)}
                disabled={changing === r.id}
                className="shrink-0 text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40"
              >
                {(Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[]).map((s) => (
                  <option key={s} value={s}>{RESERVATION_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Courts Tab ─────────────────────────────────────────────────────────────────

function CourtsTab() {
  const [courts, setCourts] = useState<Court[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newCourtName, setNewCourtName] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    getAllCourts().then((c) => { setCourts(c); setLoading(false) })
  }, [])

  async function handleToggleActive(court: Court) {
    await toggleCourtActive(court.id, !court.isActive)
    setCourts((prev) => prev.map((c) => c.id === court.id ? { ...c, isActive: !court.isActive } : c))
    toast.success(court.isActive ? 'Cancha desactivada.' : 'Cancha activada.')
  }

  async function handleSaveSettings(court: Court, settings: CourtSettings) {
    setSaving(court.id)
    try {
      await updateCourtSettings(court.id, settings)
      setCourts((prev) => prev.map((c) => c.id === court.id ? { ...c, settings } : c))
      toast.success('Configuración guardada.')
    } catch {
      toast.error('No se pudo guardar.')
    } finally {
      setSaving(null)
    }
  }

  async function handleAddCourt() {
    const name = newCourtName.trim()
    if (!name) return
    setSaving('new')
    try {
      const id = await createCourt(name)
      setCourts((prev) => [...prev, { id, name, isActive: true, settings: DEFAULT_COURT_SETTINGS }])
      setNewCourtName('')
      setAdding(false)
      toast.success('Cancha creada.')
    } catch {
      toast.error('No se pudo crear la cancha.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="space-y-4">
      {courts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          saving={saving === court.id}
          onToggleActive={() => handleToggleActive(court)}
          onSaveSettings={(s) => handleSaveSettings(court, s)}
        />
      ))}

      {adding ? (
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-gray-700">Nueva cancha</p>
          <input
            type="text"
            value={newCourtName}
            onChange={(e) => setNewCourtName(e.target.value)}
            placeholder="Nombre de la cancha"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddCourt}
              disabled={!newCourtName.trim() || saving === 'new'}
              className="flex-1 bg-brand-600 text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-40 flex items-center justify-center"
            >
              {saving === 'new' ? <Spinner sm /> : 'Crear'}
            </button>
            <button
              onClick={() => { setAdding(false); setNewCourtName('') }}
              className="flex-1 border border-gray-300 text-sm text-gray-600 rounded-xl py-2.5"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 text-sm text-gray-400 hover:border-brand-400 hover:text-brand-500 transition"
        >
          + Agregar cancha
        </button>
      )}
    </div>
  )
}

function CourtCard({
  court,
  saving,
  onToggleActive,
  onSaveSettings,
}: {
  court: Court
  saving: boolean
  onToggleActive: () => void
  onSaveSettings: (s: CourtSettings) => void
}) {
  const [settings, setSettings] = useState<CourtSettings>(court.settings)
  const [dirty, setDirty] = useState(false)

  function update(patch: Partial<CourtSettings>) {
    setSettings((s) => ({ ...s, ...patch }))
    setDirty(true)
  }

  // Tope duro de 2h del reglamento de colonos (MAX_RESERVATION_DURATION_HOURS)
  // — la UI ni siquiera ofrece configurar más que eso, independientemente
  // de lo que ya tenga guardado un court.settings viejo.
  const durations = Array.from({ length: MAX_RESERVATION_DURATION_HOURS }, (_, i) => i + 1)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Court header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-gray-800">{court.name}</span>
        <button
          onClick={onToggleActive}
          className={`text-xs font-medium px-3 py-1 rounded-full transition ${
            court.isActive
              ? 'bg-brand-100 text-brand-700 hover:bg-brand-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {court.isActive ? 'Activa' : 'Inactiva'}
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Hours */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Horario</p>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Apertura</span>
              <input
                type="time"
                value={settings.openTime}
                onChange={(e) => update({ openTime: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Cierre</span>
              <input
                type="time"
                value={settings.closeTime}
                onChange={(e) => update({ closeTime: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
        </div>

        {/* Duration */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Duración permitida</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-gray-500 mb-1 block">Mínima</span>
              <div className="flex gap-1">
                {durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => update({ minDurationHours: d })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      settings.minDurationHours === d
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {d}h
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 mb-1 block">Máxima</span>
              <div className="flex gap-1">
                {durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => update({ maxDurationHours: d })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      settings.maxDurationHours === d
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {d}h
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Rules */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reglas</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Reserv. máximas</span>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.maxActiveReservationsPerUser}
                onChange={(e) => update({ maxActiveReservationsPerUser: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Días con anticipación</span>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.daysAheadAllowed}
                onChange={(e) => update({ daysAheadAllowed: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Anticipación mínima (horas)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={settings.minLeadHours}
                onChange={(e) => update({ minLeadHours: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Plazo de pago (horas)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={settings.paymentDeadlineHours}
                onChange={(e) => update({ paymentDeadlineHours: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Monto a pagar ($)</span>
              <input
                type="number"
                min={0}
                max={10000}
                value={settings.reservationFee}
                onChange={(e) => update({ reservationFee: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
        </div>

        {/* Save */}
        {dirty && (
          <button
            onClick={() => { onSaveSettings(settings); setDirty(false) }}
            disabled={saving}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl py-3 text-sm transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Spinner sm /> : 'Guardar cambios'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────────

function UsersTab({ onPendingChange }: { onPendingChange: (n: number) => void }) {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  // Alta de colono (ver TASKS.md) — reemplaza auto-registro como punto de
  // entrada normal. registerUser()/approveUser()/rejectUser() de arriba
  // siguen intactas, solo dejaron de ser el camino principal.
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStreet, setNewStreet] = useState<ValidStreet | ''>('')
  const [newStreetNumber, setNewStreetNumber] = useState('')
  const [newPhoneDigits, setNewPhoneDigits] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getAllUsers().then((u) => {
      const sorted = u.sort((a, b) => a.name.localeCompare(b.name))
      setUsers(sorted)
      onPendingChange(sorted.filter((x) => x.status === 'pending').length)
      setLoading(false)
    })
  }, [])

  function resetCreateForm() {
    setAdding(false)
    setNewName('')
    setNewStreet('')
    setNewStreetNumber('')
    setNewPhoneDigits('')
  }

  async function handleCreateColono() {
    const name = newName.trim()
    if (name.length < 2) { toast.error('Ingresa el nombre completo del colono.'); return }
    if (!newStreet) { toast.error('Selecciona la calle.'); return }
    if (!newStreetNumber.trim()) { toast.error('Ingresa el número del domicilio.'); return }
    if (newPhoneDigits.length !== 10) { toast.error('El teléfono debe tener 10 dígitos.'); return }

    setCreating(true)
    try {
      const { uid } = await adminCreateColono({
        name,
        street: newStreet,
        streetNumber: newStreetNumber.trim(),
        phone: `+52${newPhoneDigits}`,
      })
      const newProfile: UserProfile = {
        uid,
        name,
        street: newStreet,
        streetNumber: newStreetNumber.trim(),
        address: `${newStreet} ${newStreetNumber.trim()}`,
        addressNormalized: `${newStreet} ${newStreetNumber.trim()}`.toLowerCase(),
        phone: `+52${newPhoneDigits}`,
        role: 'colono',
        status: 'active',
        createdAt: Timestamp.now(),
      }
      setUsers((prev) => [...prev, newProfile].sort((a, b) => a.name.localeCompare(b.name)))
      resetCreateForm()
      toast.success(`${name} agregado.`)
    } catch (err) {
      toast.error(adminCreateColonoErrorMessage((err as Error).message))
    } finally {
      setCreating(false)
    }
  }

  async function handleApprove(u: UserProfile) {
    setActing(u.uid)
    try {
      await approveUser(u.uid)
      setUsers((prev) => prev.map((x) => x.uid === u.uid ? { ...x, status: 'active' } : x))
      onPendingChange(users.filter((x) => x.status === 'pending' && x.uid !== u.uid).length)
      toast.success(`${u.name} aprobado.`)
    } catch {
      toast.error('No se pudo aprobar.')
    } finally {
      setActing(null)
    }
  }

  async function handleReject(u: UserProfile) {
    setActing(u.uid)
    try {
      await rejectUser(u)
      setUsers((prev) => prev.filter((x) => x.uid !== u.uid))
      onPendingChange(users.filter((x) => x.status === 'pending' && x.uid !== u.uid).length)
      toast.success(`Solicitud de ${u.name} rechazada.`)
    } catch {
      toast.error('No se pudo rechazar.')
    } finally {
      setActing(null)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  const pending = users.filter((u) => u.status === 'pending')
  const active = users.filter((u) => !u.status || u.status === 'active')

  return (
    <div className="space-y-5">
      {/* Alta de colono */}
      <div>
        {adding ? (
          <div className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-gray-700">Nuevo colono</p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: María García"
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="grid grid-cols-3 gap-2">
              {VALID_STREETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewStreet(s)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition border ${
                    newStreet === s
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newStreetNumber}
              onChange={(e) => setNewStreetNumber(e.target.value)}
              placeholder="Ej: 15"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
              <span className="bg-gray-50 px-3 py-2.5 text-gray-500 text-sm border-r border-gray-300 flex items-center select-none">
                🇲🇽 +52
              </span>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="5512345678"
                value={newPhoneDigits}
                onChange={(e) => setNewPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="flex-1 px-3 py-2.5 text-gray-900 placeholder-gray-400 outline-none text-sm bg-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateColono}
                disabled={creating}
                className="flex-1 bg-brand-600 text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-40 flex items-center justify-center"
              >
                {creating ? <Spinner sm /> : 'Crear'}
              </button>
              <button
                onClick={resetCreateForm}
                disabled={creating}
                className="flex-1 border border-gray-300 text-sm text-gray-600 rounded-xl py-2.5"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 text-sm text-gray-400 hover:border-brand-400 hover:text-brand-500 transition"
          >
            + Agregar colono
          </button>
        )}
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
            Pendientes de aprobación ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map((u) => (
              <div key={u.uid} className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <div className="mb-2.5">
                  <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {u.street} {u.streetNumber}
                    {(u.email || u.phone) && <span className="text-gray-300"> · </span>}
                    {u.email ?? u.phone ?? ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(u)}
                    disabled={acting === u.uid}
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg py-2 transition disabled:opacity-40"
                  >
                    {acting === u.uid ? '...' : 'Aprobar'}
                  </button>
                  <button
                    onClick={() => handleReject(u)}
                    disabled={acting === u.uid}
                    className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg py-2 transition disabled:opacity-40"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active users */}
      <div>
        {pending.length > 0 && (
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Activos ({active.length})
          </p>
        )}
        {active.length === 0 && pending.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Sin usuarios registrados.</p>
        )}
        <div className="space-y-2">
          {active.map((u) => (
            <div key={u.uid} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {u.name}
                  {u.uid === currentUser?.uid && (
                    <span className="ml-1.5 text-xs text-gray-400">(tú)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {u.street} {u.streetNumber}
                  {(u.email || u.phone) && <span className="text-gray-300"> · </span>}
                  {u.email ?? u.phone ?? ''}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                {ROLE_LABELS[u.role]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Advanced Tab (super-admin) ────────────────────────────────────────────────
// Asignar roles y eliminar usuarios son exclusivos de super-admin (Epic #43,
// issues #38 y siguiente) — el RoleSelector se movió aquí desde UsersTab.
// Solo se monta si profile.role === 'super-admin' (ver AdminPage), pero
// handleChangeRole/handleDelete igual re-chequean canAssignRole/
// canActOnUser por si este componente se llega a renderizar desde otro
// lado en el futuro.

function AdvancedTab() {
  const { user: currentUser, profile } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [confirmingDeleteUid, setConfirmingDeleteUid] = useState<string | null>(null)

  useEffect(() => {
    getAllUsers().then((u) => {
      const active = u
        .filter((x) => !x.status || x.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name))
      setUsers(active)
      setLoading(false)
    })
  }, [])

  async function handleChangeRole(u: UserProfile, role: UserRole) {
    if (!canAssignRole(profile?.role ?? 'colono')) {
      toast.error('No tienes permiso para asignar roles.')
      return
    }
    if (!canActOnUser(currentUser?.uid ?? '', u.uid)) {
      toast.error('No puedes modificar tu propio rol.')
      return
    }
    if (role === u.role) return
    setActing(u.uid)
    try {
      await setUserRole(u.uid, role)
      setUsers((prev) => prev.map((x) => x.uid === u.uid ? { ...x, role } : x))
      toast.success(`Rol de ${u.name} actualizado a ${ROLE_LABELS[role]}.`)
    } catch {
      toast.error('No se pudo cambiar el rol.')
    } finally {
      setActing(null)
    }
  }

  async function handleDelete(u: UserProfile) {
    if (!canActOnUser(currentUser?.uid ?? '', u.uid)) {
      toast.error('No puedes eliminarte a ti mismo.')
      return
    }
    setActing(u.uid)
    try {
      await deleteColono(u.uid)
      setUsers((prev) => prev.filter((x) => x.uid !== u.uid))
      toast.success(`${u.name} eliminado.`)
    } catch (err) {
      toast.error(deleteColonoErrorMessage((err as Error).message))
    } finally {
      setActing(null)
      setConfirmingDeleteUid(null)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="space-y-5">
      <SiteSettingsSection />
      <LogoSection />
      <PaletteSection />
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Usuarios ({users.length})
        </p>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.uid} className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              {confirmingDeleteUid === u.uid ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-gray-700">
                    ¿Eliminar a <span className="font-semibold">{u.name}</span>? No se puede deshacer.
                  </p>
                  <button
                    onClick={() => handleDelete(u)}
                    disabled={acting === u.uid}
                    className="shrink-0 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 disabled:opacity-40"
                  >
                    {acting === u.uid ? '...' : 'Eliminar'}
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteUid(null)}
                    disabled={acting === u.uid}
                    className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {u.name}
                      {u.uid === currentUser?.uid && (
                        <span className="ml-1.5 text-xs text-gray-400">(tú)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {u.street} {u.streetNumber}
                    </p>
                  </div>
                  <RoleSelector
                    role={u.role}
                    disabled={acting === u.uid || u.uid === currentUser?.uid}
                    onChange={(role) => handleChangeRole(u, role)}
                  />
                  <button
                    onClick={() => setConfirmingDeleteUid(u.uid)}
                    disabled={acting !== null || u.uid === currentUser?.uid}
                    title={u.uid === currentUser?.uid ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}
                    className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-1.5 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Nombre del sitio y contacto de WhatsApp — settings/general en Firestore
// (firestore.rules: mismo bloque genérico settings/{docId} que ya gatea
// settings/theme a isSuperAdmin() para escritura, ver #42). El nombre se
// usa en Home/Login/RegisterPage y en el título de la pestaña del
// navegador (SiteSettingsContext.tsx); el link de WhatsApp, en la tarjeta
// de contacto al final de HelpPage. Ninguno de los dos se propaga a
// manifest.json/index.html (meta tags estáticos) ni a los templates HTML
// de correo en src/services/users.ts — limitación conocida, documentada
// en TASKS.md, mismo criterio que el logo/color con archivos estáticos.
function SiteSettingsSection() {
  const { siteName: currentSiteName, whatsappUrl: currentWhatsappUrl } = useSiteSettings()
  const [siteName, setSiteName] = useState(currentSiteName)
  const [whatsappUrl, setWhatsappUrl] = useState(currentWhatsappUrl ?? '')
  const [saving, setSaving] = useState(false)

  // Si otra sesión cambia settings/general mientras este panel está
  // abierto (onSnapshot en SiteSettingsContext), refleja el valor nuevo —
  // pero solo mientras el super-admin no está a la mitad de editar.
  useEffect(() => {
    setSiteName(currentSiteName)
    setWhatsappUrl(currentWhatsappUrl ?? '')
  }, [currentSiteName, currentWhatsappUrl])

  async function handleSave() {
    setSaving(true)
    try {
      await updateSiteSettings({ siteName, whatsappUrl })
      toast.success('Configuración actualizada.')
    } catch (err) {
      toast.error(updateSiteSettingsErrorMessage((err as Error).message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Nombre del sitio y contacto
      </p>
      <div className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Nombre del sitio</label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Link de WhatsApp (opcional)</label>
          <input
            type="text"
            value={whatsappUrl}
            onChange={(e) => setWhatsappUrl(e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-600 text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-40 flex items-center justify-center"
        >
          {saving ? <Spinner sm /> : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// Logo del sitio (Epic #43, issue 4/5) — sube a Storage vía uploadLogo()
// (branding/logo, ruta fija). Solo se monta dentro de AdvancedTab, ya
// gateado por super-admin; storage.rules refuerza el mismo permiso del
// lado del servidor.
function LogoSection() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    getLogoUrl().then((url) => {
      setCurrentUrl(url)
      setLoadingCurrent(false)
    })
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!isValidLogoFile(f)) {
      toast.error(uploadLogoErrorMessage('invalid-file'))
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadLogo(file)
      setCurrentUrl(url)
      setFile(null)
      setPreview(null)
      toast.success('Logo actualizado.')
    } catch (err) {
      toast.error(uploadLogoErrorMessage((err as Error).message))
    } finally {
      setUploading(false)
    }
  }

  const displayUrl = preview ?? currentUrl

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Logo del sitio
      </p>
      <div className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          {loadingCurrent ? (
            <Spinner sm />
          ) : displayUrl ? (
            <img src={displayUrl} alt="Logo actual" className="w-14 h-14 rounded-xl object-cover bg-gray-100" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-brand-600 flex items-center justify-center">
              <span className="text-white text-xl font-bold">P</span>
            </div>
          )}
          <p className="text-xs text-gray-400">
            {!loadingCurrent && !currentUrl && !preview && 'Sin logo — se muestra la "P" por default.'}
            {preview && 'Vista previa — todavía no se sube hasta que confirmes.'}
          </p>
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleFileChange}
          className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
        />
        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-brand-600 text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-40 flex items-center justify-center"
          >
            {uploading ? <Spinner sm /> : 'Subir logo'}
          </button>
        )}
      </div>
    </div>
  )
}

// Color de acento (Epic #43, issue 5/5) — paletas curadas, ver
// src/theme/palettes.ts. ThemeProvider (montado en App.tsx) escucha
// settings/theme por onSnapshot y recolorea toda la UI sin recargar en
// cuanto setThemePalette() escribe. Limitación conocida (no se arregla
// aquí): manifest.json/index.html (theme-color)/favicon.svg y los
// templates HTML de correo en src/services/users.ts se quedan en verde
// fijo — son archivos estáticos o HTML de correo ya enviado, fuera de
// alcance de un cambio en runtime de React.
function PaletteSection() {
  const { paletteId } = useTheme()
  const [changing, setChanging] = useState<string | null>(null)

  async function handleSelect(id: string) {
    if (id === paletteId) return
    setChanging(id)
    try {
      await setThemePalette(id)
      toast.success('Color de acento actualizado.')
    } catch {
      toast.error('No se pudo cambiar el color.')
    } finally {
      setChanging(null)
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Color de acento
      </p>
      <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
        <div className="grid grid-cols-4 gap-3">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              disabled={changing !== null}
              title={p.name}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition disabled:opacity-40 ${
                p.id === paletteId ? 'ring-2 ring-offset-2 ring-gray-400' : ''
              }`}
            >
              <span
                className="w-8 h-8 rounded-full border border-black/5"
                style={{ backgroundColor: p.tones[600] }}
              />
              <span className="text-[10px] text-gray-500 truncate w-full text-center">
                {changing === p.id ? '...' : p.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────────────────────────

// Selector de rol (colono/admin/tesorero/super-admin), usado en AdvancedTab.
// `disabled` cubre tanto el estado "guardando" como el caso de un super-admin
// viendo su propia fila (no puede cambiarse su rol, ver canActOnUser).
function RoleSelector({
  role,
  disabled,
  onChange,
}: {
  role: UserRole
  disabled: boolean
  onChange: (role: UserRole) => void
}) {
  return (
    <div className="shrink-0 flex flex-wrap justify-end gap-1 bg-gray-100 rounded-full p-0.5">
      {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          disabled={disabled}
          className={`text-xs font-medium px-2.5 py-1 rounded-full transition disabled:opacity-40 ${
            role === r
              ? 'bg-brand-600 text-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  )
}

function Spinner({ sm }: { sm?: boolean }) {
  const size = sm ? 'w-4 h-4 border-2' : 'w-8 h-8 border-4'
  return (
    <div className={`${size} border-brand-500 border-t-transparent rounded-full animate-spin`} />
  )
}

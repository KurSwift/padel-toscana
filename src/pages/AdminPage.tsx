import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { Court, CourtSettings, UserProfile, UserRole, Reservation, ReservationStatus } from '@/types'
import { getAllCourts, updateCourtSettings, toggleCourtActive, createCourt, DEFAULT_COURT_SETTINGS } from '@/services/courts'
import { getAllUsers, setUserRole, approveUser, rejectUser } from '@/services/users'
import { canChangeRole } from '@/services/userRules'
import { MAX_RESERVATION_DURATION_HOURS } from '@/services/reservationRules'
import { subscribeToAllReservationsByDate, setReservationStatus } from '@/services/reservations'
import { todayString, addDays, formatDateLong, formatTime } from '@/utils/time'
import StatusBadge, { RESERVATION_STATUS_LABELS } from '@/components/StatusBadge'

type Tab = 'reservations' | 'courts' | 'users'

const ROLE_LABELS: Record<UserRole, string> = {
  colono: 'Colono',
  admin: 'Admin',
  tesorero: 'Tesorero',
}

export default function AdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('reservations')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    getAllUsers().then((users) =>
      setPendingCount(users.filter((u) => u.status === 'pending').length),
    )
  }, [tab])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Panel Admin</h1>
          <p className="text-xs text-gray-500">{profile?.name}</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex">
        {(['reservations', 'courts', 'users'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition border-b-2 relative ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'reservations' ? 'Reservaciones' : t === 'courts' ? 'Canchas' : 'Usuarios'}
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

  useEffect(() => {
    getAllUsers().then((u) => {
      const sorted = u.sort((a, b) => a.name.localeCompare(b.name))
      setUsers(sorted)
      onPendingChange(sorted.filter((x) => x.status === 'pending').length)
      setLoading(false)
    })
  }, [])

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

  async function handleChangeRole(u: UserProfile, role: UserRole) {
    if (!canChangeRole(currentUser?.uid ?? '', u.uid)) {
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

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>

  const pending = users.filter((u) => u.status === 'pending')
  const active = users.filter((u) => !u.status || u.status === 'active')

  return (
    <div className="space-y-5">
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
              <RoleSelector
                role={u.role}
                disabled={acting === u.uid || u.uid === currentUser?.uid}
                onChange={(role) => handleChangeRole(u, role)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────────────────────────

// Selector de rol (colono/admin/tesorero) de 3 opciones, usado en la
// pestaña Usuarios. `disabled` cubre tanto el estado "guardando" como el
// caso de un admin viendo su propia fila (no puede cambiarse su rol).
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
    <div className="shrink-0 flex bg-gray-100 rounded-full p-0.5">
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

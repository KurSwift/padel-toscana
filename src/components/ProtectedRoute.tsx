import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/services/auth'
import { hasAllowedRole } from '@/services/userRules'
import { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  // Si se omite, cualquier usuario autenticado y aprobado (status 'active')
  // puede entrar. Si se pasa, el rol del usuario debe estar en la lista.
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/registro" replace />

  if (profile.status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⏳</span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Solicitud en revisión</h1>
          <p className="text-sm text-gray-500 mb-1">
            Tu registro está pendiente de aprobación por el administrador.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Te avisaremos cuando tengas acceso.
          </p>
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-left mb-6">
            <p className="text-xs text-gray-400 mb-0.5">Registrado como</p>
            <p className="text-sm font-semibold text-gray-700">{profile.name}</p>
            <p className="text-xs text-gray-500">{profile.address}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-400 hover:text-gray-600 transition"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  if (profile.status === 'rejected') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✗</span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Solicitud rechazada</h1>
          <p className="text-sm text-gray-500 mb-6">
            Tu solicitud no fue aprobada. Si crees que es un error, contacta al administrador.
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-400 hover:text-gray-600 transition"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  if (!hasAllowedRole(profile.role, allowedRoles)) return <Navigate to="/" replace />

  return <>{children}</>
}

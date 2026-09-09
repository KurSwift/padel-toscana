import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { SiteSettingsProvider } from '@/context/SiteSettingsContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import PublicRoute from '@/components/PublicRoute'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import HomePage from '@/pages/HomePage'
import AdminPage from '@/pages/AdminPage'
import TesoreroPage from '@/pages/TesoreroPage'
import HelpPage from '@/pages/HelpPage'
import PublicCalendarPage from '@/pages/PublicCalendarPage'
import ReservationsPage from '@/pages/ReservationsPage'
import AppShell from '@/components/AppShell'

export default function App() {
  return (
    <BrowserRouter>
      <SiteSettingsProvider>
        <ThemeProvider>
          <AuthProvider>
            <Toaster position="top-center" />
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/registro"
                element={<RegisterPage />}
              />
              {/* Pública, sin sesión — primera excepción deliberada al
                  modelo "100% privado por invitación" (issue 8/8 del
                  épico #60, generalizada a cancha después — ver
                  PRD.md § 9). */}
              <Route
                path="/calendario"
                element={<PublicCalendarPage />}
              />
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/" element={<HomePage />} />
                <Route path="/reservaciones" element={<ReservationsPage />} />
                <Route path="/ayuda" element={<HelpPage />} />
                <Route path="/pagos" element={<ProtectedRoute allowedRoles={['tesorero', 'admin', 'super-admin']}><TesoreroPage /></ProtectedRoute>} />
                <Route path="/configuracion" element={<ProtectedRoute allowedRoles={['admin', 'super-admin']}><AdminPage /></ProtectedRoute>} />
                {/* Enlaces históricos: conservan favoritos sin duplicar la UI. */}
                <Route path="/admin" element={<Navigate to="/configuracion" replace />} />
                <Route path="/tesorero" element={<Navigate to="/pagos" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </SiteSettingsProvider>
    </BrowserRouter>
  )
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyPage from './PrivacyPage'

describe('PrivacyPage', () => {
  it('explica la analítica automática y los datos que nunca se envían', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Aviso de privacidad' })).toBeInTheDocument()
    expect(screen.getByText(/métricas agregadas de uso/i)).toBeInTheDocument()
    expect(screen.getByText(/se activa automáticamente/i)).toBeInTheDocument()
    expect(screen.getByText(/nombres, teléfonos, domicilios, correos, UID/i)).toBeInTheDocument()
    expect(screen.getByText(/contenido ni identificadores de reservaciones/i)).toBeInTheDocument()
    expect(screen.getByText(/navegación e interacción agregada/i)).toBeInTheDocument()
    expect(screen.getByText(/visitas a pantallas, desplazamientos y clics en enlaces externos/i)).toBeInTheDocument()
    expect(screen.queryByText(/completar una reservación/i)).not.toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingSheet from './BookingSheet'

const baseProps = {
  date: '2026-09-05',
  startTime: '10:00',
  availableDurations: [1, 2, 3],
  defaultResidentName: 'Juan Pérez',
  reservationFee: 300,
  paymentDeadlineHours: 24,
  onClose: vi.fn(),
}

describe('BookingSheet', () => {
  it('confirma con la duración por default (la primera de la lista) y el nombre precargado', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<BookingSheet {...baseProps} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /Confirmar/ }))

    expect(onConfirm).toHaveBeenCalledWith({
      durationHours: 1,
      playerCount: 4,
      residentInChargeName: 'Juan Pérez',
    })
  })

  it('cambia la duración seleccionada al hacer click en otra opción', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<BookingSheet {...baseProps} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: '2h' }))
    await user.click(screen.getByRole('button', { name: /Confirmar/ }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ durationHours: 2 }),
    )
  })

  it('respeta los límites MIN/MAX de jugadores deshabilitando los botones +/-', async () => {
    const user = userEvent.setup()
    render(<BookingSheet {...baseProps} onConfirm={vi.fn()} />)

    const decrement = screen.getByRole('button', { name: '−' })
    const increment = screen.getByRole('button', { name: '+' })

    // arranca en 4 (DEFAULT_PLAYER_COUNT) — bajar hasta MIN_PLAYER_COUNT (1)
    for (let i = 0; i < 5; i++) {
      await user.click(decrement)
    }
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(decrement).toBeDisabled()

    // subir hasta MAX_PLAYER_COUNT (10)
    for (let i = 0; i < 10; i++) {
      await user.click(increment)
    }
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(increment).toBeDisabled()
  })

  it('deshabilita el botón de confirmar cuando el nombre del residente está vacío', async () => {
    const user = userEvent.setup()
    render(<BookingSheet {...baseProps} onConfirm={vi.fn()} />)

    const nameInput = screen.getByPlaceholderText('Nombre del residente a cargo')
    await user.clear(nameInput)

    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeDisabled()
  })

  it('muestra la pantalla de éxito con el monto y la fecha límite de pago tras confirmar', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<BookingSheet {...baseProps} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /Confirmar/ }))

    expect(await screen.findByText('¡Reservación creada!')).toBeInTheDocument()
    expect(screen.getByText('$300')).toBeInTheDocument()
  })

  it('no pasa a la pantalla de éxito si onConfirm rechaza', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockRejectedValue(new Error('slot-taken'))
    render(<BookingSheet {...baseProps} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: /Confirmar/ }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    expect(screen.queryByText('¡Reservación creada!')).not.toBeInTheDocument()
  })

  it('llama a onClose al hacer click en el botón de cerrar (✕)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<BookingSheet {...baseProps} onConfirm={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '✕' }))

    expect(onClose).toHaveBeenCalled()
  })
})

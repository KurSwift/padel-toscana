// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge, { RESERVATION_STATUS_LABELS } from './StatusBadge'
import { ReservationStatus } from '@/types'

describe('StatusBadge', () => {
  it.each(Object.keys(RESERVATION_STATUS_LABELS) as ReservationStatus[])(
    'muestra el label en español para status "%s"',
    (status) => {
      render(<StatusBadge status={status} />)
      expect(screen.getByText(RESERVATION_STATUS_LABELS[status])).toBeInTheDocument()
    },
  )
})

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyNoticeLink from './PrivacyNoticeLink'

describe('PrivacyNoticeLink', () => {
  it('lleva al aviso de privacidad público', () => {
    render(
      <MemoryRouter>
        <PrivacyNoticeLink />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/privacidad')
  })
})

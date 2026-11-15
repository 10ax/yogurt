import { createElement, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { CalendarSettings } from '../src/renderer/src/components/CalendarSettings'
import { LOCALES, setLanguage, t } from '../src/shared/i18n'

vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); setLanguage('en') })

it('shows the saved switch only with calendar access and at least one calendar', async () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
  const react = await vi.importActual<typeof import('react')>('react')
  for (const status of ['granted', 'denied', 'notDetermined', 'unsupported', 'error'] as const) {
    for (const count of [0, 1]) for (const hide of [false, true]) {
      vi.mocked(useState).mockImplementation(react.useState)
        .mockImplementationOnce(() => [{ status, hideEventsWithoutCallLink: hide,
          calendars: Array.from({ length: count }, () => ({ id: 'work', name: 'Work', source: 'Calendar', enabled: true })) }, vi.fn()])
      const html = renderToStaticMarkup(createElement(CalendarSettings))
      if (status === 'granted' && count) {
        expect(html).toContain(`role="switch" aria-checked="${hide}"`)
        expect(html).toContain('aria-describedby="calendar-call-link-description"')
      } else expect(html).not.toContain('calendar-call-link-toggle')
    }
  }
})

it('translates both lines in every interface language', () => {
  for (const { id } of LOCALES) {
    setLanguage(id)
    for (const key of ['Hide events without a call link', 'Keep your agenda and reminders focused on calls.']) {
      expect(t(key).trim()).not.toBe('')
      if (id !== 'en') expect(t(key)).not.toBe(key)
    }
  }
})

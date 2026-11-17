import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Agenda } from '../src/renderer/src/components/Agenda'

const fixture = vi.hoisted(() => ({ index: 0, day: {} as any, event: {} as any }))
vi.mock('react', async original => {
  const react = await original<typeof import('react')>()
  return { ...react, useState: (initial: any) => react.useState(fixture.index++ === 2 ? fixture.day : initial) }
})
vi.mock('../src/renderer/src/dates', async original => ({ ...await original<typeof import('../src/renderer/src/dates')>(), useDay: () => new Date().toDateString() }))
vi.mock('../src/renderer/src/components/People', async original => ({ ...await original<typeof import('../src/renderer/src/components/People')>(), useMyName: () => '' }))
vi.mock('../src/renderer/src/motion', async original => ({ ...await original<typeof import('../src/renderer/src/motion')>(), usePopoverPresence: () => ({ value: fixture.event, props: {} }) }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it.each([[-600_001, false], [-600_000, true], [0, true], [1_800_000, false]])('uses the same Join window in the agenda at offset %s', (offset, visible) => {
  vi.useFakeTimers()
  const start = +new Date(2026, 10, 16, 12)
  vi.setSystemTime(start + Number(offset))
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
  fixture.index = 0
  fixture.event = { id: 'event', title: 'Review', start, end: start + 1_800_000, attendees: [], url: 'https://call.example/meeting' }
  fixture.day = { at: start, status: 'granted', events: [fixture.event] }
  const html = renderToStaticMarkup(createElement(Agenda, { revision: 0, onStart: async () => {}, onOpen() {} }))
  expect(html).toContain('event-details-content')
  expect(html.includes('Join meeting')).toBe(visible)
  expect(html.includes('href="https://call.example/meeting"')).toBe(visible)
})

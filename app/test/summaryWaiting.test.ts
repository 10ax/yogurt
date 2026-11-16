import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it } from 'vitest'
import { setLanguage } from '../src/shared/i18n'
import { SummaryWaiting } from '../src/renderer/src/components/SummaryWaiting'

afterEach(() => setLanguage('en'))

it('announces transcript reading once, with a decorative two-section outline', () => {
  const html = renderToStaticMarkup(createElement(SummaryWaiting))
  expect(html).toContain('data-testid="note-enhanced-waiting"')
  expect(html).toContain('aria-live="polite"')
  expect(html).toContain('class="summary-outline" aria-hidden="true"')
  expect(html.match(/summary-outline-heading/g)).toHaveLength(2)
  expect(html.match(/class="summary-outline-bullet"/g)).toHaveLength(4)
  expect(html.match(/Reading the transcript…/g)).toHaveLength(1)
  expect(html).toContain('sr-only')
  expect(html).not.toContain('Reading a long meeting')
})

it('uses the actual long-meeting part and localizes both labels', () => {
  expect(renderToStaticMarkup(createElement(SummaryWaiting, { part: { part: 2, of: 4 } })))
    .toContain('Reading a long meeting, part 2 of 4…')
  setLanguage('fr')
  expect(renderToStaticMarkup(createElement(SummaryWaiting))).toContain('Lecture de la transcription…')
  const html = renderToStaticMarkup(createElement(SummaryWaiting, { part: { part: 2, of: 4 } }))
  expect(html).toContain('Lecture d’une longue réunion, partie 2 sur 4…')
  expect(html).not.toContain('Lecture de la transcription…')
})

it('announces the actual part without a visible label during a rewrite', () => {
  const reading = renderToStaticMarkup(createElement(SummaryWaiting, { outline: false, part: { part: 2, of: 4 } }))
  expect(reading).toContain('Reading a long meeting, part 2 of 4…')
  expect(reading).toContain('aria-live="polite"')
  expect(reading).not.toContain('summary-outline')
  expect(reading).toContain('sr-only')
})

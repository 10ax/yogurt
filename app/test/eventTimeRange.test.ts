import { expect, it } from 'vitest'
import { eventTimeRange } from '../src/shared/dates'
import { LOCALES } from '../src/shared/i18n'

const at = (hour: number, minute = 0, day = 16) => +new Date(2026, 10, day, hour, minute)
const spaces = (text: string) => text.replace(/\s/g, ' ')
it('shares AM or PM for same-day ranges', () => {
  expect(spaces(eventTimeRange(at(10), at(10, 30), 'en-US'))).toBe('10:00 – 10:30 AM')
  expect(spaces(eventTimeRange(at(13), at(13, 30), 'en-US'))).toBe('1:00 – 1:30 PM')
})
it('keeps both periods across noon, midnight, different days or reversed times', () => {
  expect(eventTimeRange(at(11), at(13), 'en-US')).toBe('11:00 AM – 1:00 PM')
  expect(eventTimeRange(at(23), at(1, 0, 17), 'en-US')).toBe('11:00 PM – 1:00 AM')
  expect(eventTimeRange(at(10), at(10, 30, 17), 'en-US')).toBe('10:00 AM – 10:30 AM')
  expect(eventTimeRange(at(10, 30), at(10), 'en-US')).toBe('10:30 AM – 10:00 AM')
})
it('keeps 24-hour locale formatting and handles missing or equal end times', () => {
  expect(eventTimeRange(at(10), at(10, 30), 'en-GB')).toBe('10:00 – 10:30')
  expect(eventTimeRange(at(10), null, 'en-US')).toBe('10:00 AM')
  expect(eventTimeRange(at(10), undefined, 'en-US')).toBe('10:00 AM')
  expect(eventTimeRange(at(10), at(10), 'en-US')).toBe('10:00 AM')
})
it('uses native placement and numerals in all supported locales, including leading periods', () => {
  for (const { id } of LOCALES) {
    const format = new Intl.DateTimeFormat(id, { hour: 'numeric', minute: '2-digit' })
    const hasPeriod = format.formatToParts(at(10)).some(p => p.type === 'dayPeriod')
    expect(eventTimeRange(at(10), at(10, 30), id)).toBe(hasPeriod ? format.formatRange(at(10), at(10, 30)) : `${format.format(at(10))} – ${format.format(at(10, 30))}`)
  }
  const leading = new Intl.DateTimeFormat('ko', { hour: 'numeric', minute: '2-digit' }).formatToParts(at(10)).find(p => p.type === 'dayPeriod')!.value
  expect(eventTimeRange(at(10), at(10, 30), 'ko').startsWith(leading)).toBe(true)
})

import { language, t } from './i18n'

const DAY = 86_400_000
/** whole calendar days from `ms` to today (0 today, 1 yesterday, -1 tomorrow) */
export const daysAgo = (ms: number, now = Date.now()) =>
  Math.round((new Date(new Date(now).toDateString()).getTime() - new Date(new Date(ms).toDateString()).getTime()) / DAY)

/** Today, Yesterday, Tomorrow, a weekday this past week, else the date, in the interface's language */
export function dayLabel(ms: number, opts: { weekday?: boolean } = {}): string {
  const d = new Date(ms), days = daysAgo(ms)
  if (days === 0) return t('Today')
  if (days === 1) return t('Yesterday')
  if (days === -1) return t('Tomorrow')
  if (opts.weekday && days > 1 && days < 7) return d.toLocaleDateString(language(), { weekday: 'long' })
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(language(), { ...(opts.weekday ? { weekday: 'short' } : {}), month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Note metadata keeps the weekday alongside older dates. */
export function noteDateLabel(ms: number): string {
  const days = daysAgo(ms)
  if (days === 0 || days === 1) return dayLabel(ms)
  const date = new Date(ms)
  return date.toLocaleDateString(language(), { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) })
}

/** 10:30 AM, 10:30, as the interface's language writes it */
export const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(language(), { hour: 'numeric', minute: '2-digit' })

/** Let the locale place a shared day period before or after the range. */
export function eventTimeRange(start: number, end: number | null | undefined, locale = language()): string {
  const format = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
  if (end == null) return format.format(start)
  const period = (at: number) => format.formatToParts(at).find(part => part.type === 'dayPeriod')?.value
  const sharedPeriod = period(start)
  if (end >= start && sharedPeriod && sharedPeriod === period(end) && new Date(start).toDateString() === new Date(end).toDateString()) {
    return format.formatRange(start, end)
  }
  return `${format.format(start)} – ${format.format(end)}`
}

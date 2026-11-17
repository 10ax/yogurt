import { expect, it } from 'vitest'
import { canJoinEvent } from '../src/shared/comingUp'

const start = 2_000_000, end = start + 30 * 60_000
it('hides Join before the ten-minute window', () => {
  expect(canJoinEvent(start, end, start - 600_001)).toBe(false)
  expect(canJoinEvent(start, end, start - 86_400_000)).toBe(false)
})
it('shows Join from exactly ten minutes before the start until just before the end', () => {
  for (const now of [start - 600_000, start - 1, start, end - 1]) expect(canJoinEvent(start, end, now)).toBe(true)
})
it('hides Join at the end and afterward, including old meetings', () => {
  expect(canJoinEvent(start, end, end)).toBe(false)
  expect(canJoinEvent(start, end, end + 1)).toBe(false)
  expect(canJoinEvent(start, end, end + 7 * 86_400_000)).toBe(false)
})
it('does not infer an active window when the event end is missing', () => {
  expect(canJoinEvent(start, null, start)).toBe(false)
  expect(canJoinEvent(start, undefined, start)).toBe(false)
})

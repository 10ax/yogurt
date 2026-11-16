import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTracerSchedule, TRACER_DELAY_MS, TRACER_LAP_MS, type TracerState } from '../src/shared/askTracer'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const idle: TracerState = { focused: false, hovered: false, hasText: false, reduced: false, hidden: false }
const setup = (initial = idle) => {
  const play = vi.fn(), stop = vi.fn()
  const schedule = createTracerSchedule(initial, play, stop)
  return { ...schedule, play, stop }
}

it('plays one lap after opening even with autofocus, then stays quiet while focused', () => {
  const s = setup({ ...idle, focused: true })
  vi.advanceTimersByTime(TRACER_DELAY_MS - 1)
  s.update({ ...idle, focused: true })
  expect(s.play).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(s.play).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(TRACER_LAP_MS - 1)
  expect(s.stop).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(s.stop).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(24000)
  expect(s.play).toHaveBeenCalledTimes(1)
  s.dispose()
})

it.each(['hasText', 'hovered', 'reduced', 'hidden'] as const)('suppresses opening with %s, without replaying an opening when it clears', flag => {
  const s = setup({ ...idle, focused: true, [flag]: true })
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  s.update({ ...idle, focused: true })
  vi.advanceTimersByTime(24000)
  expect(s.play).not.toHaveBeenCalled()
  s.update(idle)
  vi.advanceTimersByTime(7999)
  expect(s.play).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(s.play).toHaveBeenCalledTimes(1)
  s.dispose()
})

it.each(['hasText', 'hovered', 'reduced', 'hidden'] as const)('cancels a running opening on %s and waits a full idle interval', flag => {
  const s = setup()
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  expect(s.play).toHaveBeenCalledTimes(1)
  s.update({ ...idle, [flag]: true })
  expect(s.stop).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(24000)
  expect(s.play).toHaveBeenCalledTimes(1)
  s.update(idle)
  vi.advanceTimersByTime(7999)
  expect(s.play).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(1)
  expect(s.play).toHaveBeenCalledTimes(2)
  s.dispose()
})

it('repeats at eight-second start-to-start intervals only while empty, unfocused and unhovered', () => {
  const s = setup()
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  expect(s.play).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(7999)
  expect(s.play).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(1)
  expect(s.play).toHaveBeenCalledTimes(2)
  s.update({ ...idle, focused: true })
  expect(s.stop).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(24000)
  expect(s.play).toHaveBeenCalledTimes(2)
  s.update({ ...idle, hasText: true })
  vi.advanceTimersByTime(24000)
  expect(s.play).toHaveBeenCalledTimes(2)
  s.update(idle)
  vi.advanceTimersByTime(8000)
  expect(s.play).toHaveBeenCalledTimes(3)
  s.dispose()
})

it('cancels the pending opening on input or hover, including input cleared before the delay ends', () => {
  for (const flag of ['hasText', 'hovered'] as const) {
    const s = setup({ ...idle, focused: true })
    vi.advanceTimersByTime(TRACER_DELAY_MS / 2)
    s.update({ ...idle, focused: true, [flag]: true })
    s.update({ ...idle, focused: true })
    vi.advanceTimersByTime(24000)
    expect(s.play).not.toHaveBeenCalled()
    s.dispose()
  }
})

it('disposes timers on close and gets a fresh opening lap on reopen', () => {
  const first = setup()
  vi.advanceTimersByTime(TRACER_DELAY_MS / 2)
  first.dispose()
  first.update(idle)
  vi.advanceTimersByTime(24000)
  expect(first.play).not.toHaveBeenCalled()
  const next = setup({ ...idle, focused: true })
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  expect(next.play).toHaveBeenCalledTimes(1)
  next.dispose()
  expect(next.stop).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

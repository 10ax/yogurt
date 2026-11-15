import { describe, expect, it } from 'vitest'
import { createCrashPolicy } from '../src/main/crashPolicy'

const setup = (restartThrows = false) => {
  const calls: string[] = []
  const clock = { now: 0 }
  const policy = createCrashPolicy({
    now: () => clock.now,
    restart: () => { calls.push('restart'); if (restartThrows) throw new Error('no helper') },
    hiccup: () => calls.push('hiccup'),
    giveUp: () => calls.push('giveUp'),
  })
  return { policy, calls, clock }
}

describe('crash policy', () => {
  it('a clean end does nothing', () => {
    const { policy, calls } = setup()
    expect(policy.ended({ crashed: false })).toBe('done')
    expect(calls).toEqual([])
  })
  it('the first crash restarts and shows the hiccup', () => {
    const { policy, calls } = setup()
    expect(policy.ended({ crashed: true })).toBe('restarted')
    expect(calls).toEqual(['restart', 'hiccup'])
  })
  it('a crash long after the last one restarts again, so a long meeting keeps recording (2.5 h meeting report)', () => {
    const { policy, calls, clock } = setup()
    for (let i = 0; i < 5; i++) { clock.now += 30 * 60_000; expect(policy.ended({ crashed: true })).toBe('restarted') }
    expect(calls.filter((c) => c === 'giveUp')).toEqual([])
  })
  it('a crash loop (a third crash within two minutes) stops the meeting', () => {
    const { policy, calls, clock } = setup()
    expect(policy.ended({ crashed: true })).toBe('restarted')
    clock.now += 20_000
    expect(policy.ended({ crashed: true })).toBe('restarted')
    clock.now += 20_000
    expect(policy.ended({ crashed: true })).toBe('stopped')
    expect(calls).toEqual(['restart', 'hiccup', 'restart', 'hiccup', 'giveUp'])
  })
  it('a restart that fails stops the meeting at once, with no hiccup', () => {
    const { policy, calls } = setup(true)
    expect(policy.ended({ crashed: true })).toBe('stopped')
    expect(calls).toEqual(['restart', 'giveUp'])
  })
})

import { expect, it } from 'vitest'
import { createLevelLog } from '../src/main/levelLog'

// #35: "no call audio" reports need to show whether the call was heard at all, without anything from the meeting
it('once a minute, logs how loud each side got, and says when the call side heard nothing', () => {
  const log = createLevelLog(60_000)
  expect(log({ me: 0.4, them: 0.6 }, 0)).toBeUndefined()
  expect(log({ me: 0.7, them: 0.2 }, 30_000)).toBeUndefined()
  expect(log({ me: 0.1, them: 0.1 }, 60_000)).toBe('LEVEL last 60 s: loudest me 0.70, them 0.60')
  expect(log({ me: 0.5, them: 0 }, 90_000)).toBeUndefined()
  expect(log({ me: 0.5, them: 0.01 }, 120_000)).toBe('LEVEL last 60 s: loudest me 0.50, them 0.01 (no call audio heard)')
})

import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { spring } from 'motion'

const css = readFileSync(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8')
const points = (name: string) => css.match(new RegExp(`--ease-player-${name}: linear\\(([^)]+)\\)`))![1].split(',').map(Number)

it('returns on a physical spring with fast arrival, a four-pixel overshoot and one small settle', () => {
  const values = points('return')
  const curve = spring({ stiffness: 640, damping: 32, mass: 1, restDelta: .005, restSpeed: .1, keyframes: [0, 1] })
  expect(values).toHaveLength(37)
  values.forEach((value, i) => expect(value).toBeCloseTo(curve.next(i * 10).value, 4))
  expect(css).toContain('--dur-player-return: 360ms')
  expect(values[10]).toBeGreaterThan(.9)
  const overshoot = (Math.max(...values) - 1) * 52
  expect(overshoot).toBeGreaterThan(3.5)
  expect(overshoot).toBeLessThan(4.5)
  expect(Math.min(...values.slice(17))).toBeGreaterThan(.99)
  expect(values.at(-1)).toBe(1)
})

it('ducks in 160ms with increasing speed, no anticipation delay, and the existing final-quarter fade', () => {
  const values = points('duck')
  expect(css).toContain('--dur-player-duck: 160ms')
  expect(values[0]).toBe(0)
  expect(values.at(-1)).toBe(1)
  const steps = values.slice(1).map((value, i) => value - values[i])
  steps.slice(1).forEach((step, i) => expect(step).toBeGreaterThan(steps[i]))
  expect(css).toContain('opacity calc(var(--dur-player-duck)/4) linear calc(var(--dur-player-duck)*.75)')
  expect(css).toContain('transform:none;transition:opacity var(--dur-micro) var(--ease-out)')
})

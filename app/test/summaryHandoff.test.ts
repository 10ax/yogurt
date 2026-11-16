import { useEffect, useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSummaryPresentation } from '../src/renderer/src/summaryPresentation'
import { motion } from '../src/renderer/src/motion'
import type { NoteView } from '../src/shared/types'

vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: vi.fn(), useEffect: vi.fn() }))
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const note = (patch: Partial<NoteView> = {}): NoteView => ({ meetingId: 'meeting', status: 'waiting', enhanced: 'Previous summary', draft: '', mine: '', edited: false, peopleChanged: false, ...patch })

function harness() {
  let state: unknown, dirty = false, dependencies: unknown[] | undefined, cleanup: (() => void) | void
  return (notes: NoteView | undefined, reduced = false) => {
    vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, (next: unknown) => void] => {
      state ??= typeof initial === 'function' ? initial() : initial
      return [state, next => { state = typeof next === 'function' ? next(state) : next; dirty = true }]
    })
    let result: ReturnType<typeof useSummaryPresentation>
    do { dirty = false; result = useSummaryPresentation(notes, reduced) } while (dirty)
    const [effect, deps] = vi.mocked(useEffect).mock.lastCall!
    if (!dependencies || deps!.some((dep, i) => dep !== dependencies![i])) {
      cleanup?.(); dependencies = [...deps!]; cleanup = effect()
    }
    return result
  }
}

it('fades on the first words once, without restarting for more chunks or animating completion', () => {
  vi.useFakeTimers()
  const render = harness()
  expect(render(note())).toBe('rewriting')
  expect(render(note({ status: 'writing', draft: '## ' }))).toBe('rewriting')
  expect(render(note({ status: 'writing', draft: '## Release' }))).toBe('handoff')
  vi.advanceTimersByTime(motion.micro / 2)
  expect(render(note({ status: 'writing', draft: '## Release plan' }))).toBe('handoff')
  vi.advanceTimersByTime(motion.micro / 2)
  expect(render(note({ status: 'writing', draft: '## Release plan' }))).toBe('reset')
  vi.advanceTimersByTime(16)
  expect(render(note({ status: 'writing', draft: '## Release plan' }))).toBe('streaming')
  expect(render(note({ status: 'done', enhanced: 'New summary' }))).toBe('saved')
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['failed', 'done', 'stopped'] as const)('restores the old result on %s before writing, during the fade, or after writing', status => {
  vi.useFakeTimers()
  for (const elapsed of [undefined, 0, motion.micro]) {
    const render = harness()
    render(note())
    if (elapsed !== undefined) {
      render(note({ status: 'writing', draft: 'New draft' }))
      vi.advanceTimersByTime(elapsed)
    }
    expect(render(note({ status, draft: 'Abandoned partial' }))).toBe('saved')
    vi.advanceTimersByTime(motion.micro)
    expect(render(note({ status }))).toBe('saved')
    expect(vi.getTimerCount()).toBe(0)
  }
})

it('skips fading first summaries and reopened streams, but still resets hidden scroll for reduced motion', () => {
  vi.useFakeTimers()
  const first = harness()
  expect(first(note({ enhanced: null }))).toBe('waiting')
  expect(first(note({ enhanced: null, status: 'writing', draft: 'First words' }))).toBe('streaming')
  expect(harness()(note({ status: 'writing', draft: 'Already writing' }))).toBe('streaming')
  const reduced = harness()
  reduced(note(), true)
  expect(reduced(note({ status: 'writing', draft: 'New draft' }), true)).toBe('reset')
  vi.advanceTimersByTime(16)
  expect(reduced(note({ status: 'writing', draft: 'New draft' }), true)).toBe('streaming')
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels the fade on navigation or a live reduced-motion change', () => {
  vi.useFakeTimers()
  const render = harness()
  render(note()); render(note({ status: 'writing', draft: 'New draft' }))
  expect(render(note({ meetingId: 'other', status: 'done' }))).toBe('saved')
  expect(vi.getTimerCount()).toBe(0)
  render(note()); render(note({ status: 'writing', draft: 'New draft' }))
  render(note({ status: 'writing', draft: 'New draft' }), true)
  expect(render(note({ status: 'writing', draft: 'New draft' }), true)).toBe('reset')
  vi.advanceTimersByTime(16)
  expect(render(note({ status: 'writing', draft: 'New draft' }), false)).toBe('streaming')
  expect(vi.getTimerCount()).toBe(0)
})

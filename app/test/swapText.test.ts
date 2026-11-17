import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useLayoutEffect, useRef, useState } from 'react'
import { SwapText } from '../src/renderer/src/components/Swap'

vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useRef: vi.fn(), useState: vi.fn(), useEffect: vi.fn(), useLayoutEffect: vi.fn() }))
const setWidth = vi.fn(), observe = vi.fn(), disconnect = vi.fn()
let resized: () => void, measured = 90, width: number | undefined
const label = { getBoundingClientRect: () => ({ width: measured }) }
beforeEach(() => {
  vi.clearAllMocks(); width = undefined; measured = 90
  vi.mocked(useRef).mockImplementation(((value: unknown) => ({ current: value === null ? label : value })) as typeof useRef)
  vi.mocked(useState).mockImplementation((() => [width, setWidth]) as typeof useState)
  vi.stubGlobal('ResizeObserver', class { constructor(fn: () => void) { resized = fn } observe = observe; disconnect = disconnect })
})
afterEach(() => vi.unstubAllGlobals())

it('measures the current words, follows font changes and disconnects when the label is replaced', () => {
  const initial = SwapText({ text: 'Summarizing…' })
  expect(initial.props['data-resize']).toBe(true)
  expect(initial.props.style).toBeUndefined()
  const cleanup = vi.mocked(useLayoutEffect).mock.calls.at(-1)![0]()
  expect(observe).toHaveBeenCalledWith(label); expect(setWidth).toHaveBeenLastCalledWith(90)
  measured = 126; resized(); expect(setWidth).toHaveBeenLastCalledWith(126)
  width = 126
  const next = SwapText({ text: 'Resume recording' })
  expect(next.props.style).toEqual({ width: 126 })
  expect(next.props.children.props.children).toBe('Resume recording')
  expect(vi.mocked(useLayoutEffect).mock.calls.at(-1)![1]).toEqual(['Resume recording', undefined])
  cleanup?.(); expect(disconnect).toHaveBeenCalledOnce()
})

it('keeps reserved-width labels unchanged and never observes them', () => {
  width = 90
  const tree = SwapText({ text: 'Copy', widest: 'Copied' })
  expect(tree.props['data-widest']).toBe('Copied')
  expect(tree.props['data-resize']).toBeUndefined(); expect(tree.props.style).toBeUndefined()
  expect(vi.mocked(useLayoutEffect).mock.calls.at(-1)![0]()).toBeUndefined()
  expect(observe).not.toHaveBeenCalled(); expect(setWidth).not.toHaveBeenCalled()
})

import { afterEach, expect, it, vi } from 'vitest'
import { createElement, useEffect, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RendererGuard, RendererRecovery, RendererFailureTest } from '../src/renderer/src/components/RendererGuard'
import { handoffOpenNotes } from '../src/renderer/src/noteAutosave'

const state = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (value: unknown) => [value, state.set], useEffect: vi.fn() }))
vi.mock('../src/renderer/src/i18n', () => ({ useLanguage() {} }))
vi.mock('../src/renderer/src/noteAutosave', () => ({ handoffOpenNotes: vi.fn(() => true) }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('replaces failed children with an accessible recovery action and reports the component stack', () => {
  const send = vi.fn()
  vi.stubGlobal('window', { yogurt: { reportRendererError: send } })
  const child = createElement('span', null, 'App'), guard = new RendererGuard({ children: child })
  expect(guard.render()).toBe(child)
  guard.state = RendererGuard.getDerivedStateFromError()
  guard.componentDidCatch(new Error('Renderer recovery test'), { componentStack: '\n    at Broken (file:///app/index.js:2:3)' })
  const markup = renderToStaticMarkup(guard.render())
  expect(markup).toContain('data-testid="renderer-recovery"')
  expect(markup).toContain('role="alert"')
  expect(markup).toContain('Reload</button>')
  expect(markup).not.toContain('Renderer recovery test')
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Renderer recovery test', componentStack: '    at Broken (index.js:2:3)' }))
})
it('reloads only after pending edits were handed to main, keeping recovery available on failure', () => {
  const reload = vi.fn()
  vi.stubGlobal('window', { location: { reload } })
  const recovery = RendererRecovery()
  const content = recovery.props.children[1] as ReactElement<{ children: ReactElement<{ onClick(): void }>[] }>
  const click = content.props.children[1].props.onClick
  vi.mocked(handoffOpenNotes).mockReturnValueOnce(false)
  click()
  expect(reload).not.toHaveBeenCalled()
  expect(state.set).toHaveBeenCalledWith(true)
  click()
  expect(reload).toHaveBeenCalledOnce()
})

it('installs the synthetic throw trigger only in fake mode', () => {
  const addEventListener = vi.fn(), removeEventListener = vi.fn()
  const win = { yogurt: { fake: false }, addEventListener, removeEventListener }
  vi.stubGlobal('window', win)
  RendererFailureTest({ children: null })
  const effect = vi.mocked(useEffect).mock.calls.at(-1)![0]
  expect(effect()).toBeUndefined()
  expect(addEventListener).not.toHaveBeenCalled()
  win.yogurt.fake = true
  const stop = effect()
  expect(addEventListener).toHaveBeenCalledWith('yogurt:renderer-fail', expect.any(Function))
  addEventListener.mock.calls[0][1]()
  expect(state.set).toHaveBeenCalledWith(true)
  if (stop) stop()
  expect(removeEventListener).toHaveBeenCalledWith('yogurt:renderer-fail', addEventListener.mock.calls[0][1])
})

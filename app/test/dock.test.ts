import { beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const native = vi.hoisted(() => ({
  visible: false,
  app: { dock: { isVisible: vi.fn((): boolean => native.visible) }, setActivationPolicy: vi.fn((policy: string) => { native.visible = policy === 'regular' }), focus: vi.fn() },
}))
vi.mock('electron', () => ({ app: native.app }))
import { setDockVisible } from '../src/main/dock'

const window = () => ({ isDestroyed: vi.fn(() => false), isFocused: vi.fn(() => true), show: vi.fn(), focus: vi.fn() })
const apply = (on: boolean, win?: ReturnType<typeof window>, os: NodeJS.Platform = 'darwin') => setDockVisible(on, win as unknown as BrowserWindow, os)
beforeEach(() => { vi.clearAllMocks(); native.visible = false })

it('leaves default startup alone and applies the saved Dock-off choice without taking focus', () => {
  native.visible = true
  apply(true)
  expect(native.app.setActivationPolicy).not.toHaveBeenCalled()
  apply(false)
  expect(native.app.setActivationPolicy).toHaveBeenCalledExactlyOnceWith('accessory')
  expect(native.app.focus).not.toHaveBeenCalled()
})

it('applies rapid changes using the native state, without a cached state or a hide timer', () => {
  for (const on of [true, false, true, true, false]) apply(on)
  expect(native.app.setActivationPolicy.mock.calls).toEqual([['regular'], ['accessory'], ['regular'], ['accessory']])
  expect(native.visible).toBe(false)
  native.visible = true
  apply(false)
  expect(native.app.setActivationPolicy).toHaveBeenCalledTimes(5)
})

it('keeps the focused Settings window usable when the policy changes', () => {
  const win = window()
  apply(true, win)
  expect(native.app.focus).toHaveBeenCalledExactlyOnceWith({ steal: true })
  expect(win.focus).toHaveBeenCalledOnce()
  expect(win.show).toHaveBeenCalledOnce()
  expect(native.app.setActivationPolicy.mock.invocationCallOrder[0]).toBeLessThan(win.show.mock.invocationCallOrder[0])
  expect(win.show.mock.invocationCallOrder[0]).toBeLessThan(native.app.focus.mock.invocationCallOrder[0])
  expect(native.app.focus.mock.invocationCallOrder[0]).toBeLessThan(win.focus.mock.invocationCallOrder[0])
})

it('never focuses a background or destroyed window, or touches other platforms', () => {
  const win = window()
  win.isFocused.mockReturnValue(false)
  apply(true, win)
  win.isDestroyed.mockReturnValue(true)
  apply(false, win)
  expect(native.app.focus).not.toHaveBeenCalled()
  expect(win.focus).not.toHaveBeenCalled()
  expect(win.show).not.toHaveBeenCalled()
  for (const os of ['win32', 'linux'] as const) apply(true, win, os)
  expect(native.app.setActivationPolicy).toHaveBeenCalledTimes(2)
})

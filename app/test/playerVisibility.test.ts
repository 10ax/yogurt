import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { attachPlayerVisibility } from '../src/renderer/src/playerVisibility'

class Element extends EventTarget {
  scrollHeight = 2000
  clientHeight = 400
  clientWidth = 500
  clientLeft = 0
  scrollTop = 0
  dataset: Record<string, string> = {}
  contains(value: unknown) { return value === this }
  closest() { return null }
  getBoundingClientRect() { return { left: 0, width: 500 } }
}
class Observer {
  static all: Observer[] = []
  observe = vi.fn()
  disconnect = vi.fn()
  constructor(public change: () => void) { Observer.all.push(this) }
}
let doc: EventTarget & { activeElement: Element | null }
beforeEach(() => {
  vi.useFakeTimers()
  doc = Object.assign(new EventTarget(), { activeElement: null })
  Observer.all = []
  vi.stubGlobal('document', doc)
  vi.stubGlobal('ResizeObserver', Observer)
  vi.stubGlobal('MutationObserver', Observer)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function input(target: EventTarget, type: string, props: Record<string, unknown> = {}) {
  const event = Object.assign(new Event(type), props)
  Object.defineProperty(event, 'isTrusted', { value: true })
  target.dispatchEvent(event)
}
function setup() {
  const list = new Element(), dock = new Element()
  const controls = attachPlayerVisibility(list as unknown as HTMLElement, dock as unknown as HTMLElement)
  const scroll = (top: number) => { list.scrollTop = top; list.dispatchEvent(new Event('scroll')) }
  const wheel = (deltaY = 100) => input(list, 'wheel', { deltaY, deltaX: 0 })
  const hide = () => { wheel(); scroll(100); vi.advanceTimersByTime(120); expect(dock.dataset.hidden).toBe('true') }
  return { list, dock, controls, scroll, wheel, hide }
}
it('requires real user input and ignores raw programmatic scrolls and synthetic gestures', () => {
  const { list, dock, controls, scroll } = setup()
  scroll(100)
  list.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: 200, deltaX: 0 }))
  scroll(300)
  expect(dock.dataset.hidden).toBe('false')
  controls.dispose()
})
it('keeps the last scroll-event position when a passive wheel arrives after the offset changes', () => {
  const { list, dock, controls, scroll, wheel } = setup()
  scroll(240)
  list.scrollTop = 360
  wheel(120)
  scroll(360)
  expect(dock.dataset.hidden).toBe('true')
  controls.dispose()
})
it('filters jitter and uses separate down and up thresholds', () => {
  const { dock, controls, scroll, wheel } = setup()
  wheel()
  for (const y of [2, 0, 3, 1, 4, 2, 25]) { scroll(y); expect(dock.dataset.hidden).toBe('false') }
  scroll(26); expect(dock.dataset.hidden).toBe('true')
  vi.advanceTimersByTime(120)
  scroll(19); expect(dock.dataset.hidden).toBe('true')
  scroll(18); expect(dock.dataset.hidden).toBe('false')
  controls.dispose()
})
it('returns after scrolling stops, extending the delay through momentum', () => {
  const { dock, controls, scroll, hide } = setup()
  hide()
  vi.advanceTimersByTime(700); scroll(150)
  vi.advanceTimersByTime(899); expect(dock.dataset.hidden).toBe('true')
  vi.advanceTimersByTime(1); expect(dock.dataset.hidden).toBe('false')
  vi.advanceTimersByTime(180)
  scroll(250); expect(dock.dataset.hidden).toBe('false')
  controls.dispose()
})
it('retargets both directions immediately during motion without a queued animation or restart', () => {
  const { dock, controls, scroll, wheel } = setup()
  wheel(); scroll(100); expect(dock.dataset.hidden).toBe('true')
  vi.advanceTimersByTime(60); scroll(110); scroll(90)
  expect(dock.dataset.hidden).toBe('false')
  scroll(140); expect(dock.dataset.hidden).toBe('true')
  scroll(150); expect(dock.dataset.hidden).toBe('true')
  // Only the reading-pause timer remains; there is no animation lock or deferred reversal.
  expect(vi.getTimerCount()).toBe(1)
  controls.dispose()
})

it('clears a gesture before following playback, citation jumps, search or keyboard navigation', () => {
  const { dock, controls, scroll, hide } = setup()
  hide(); controls.programmatic()
  scroll(500); vi.advanceTimersByTime(400); scroll(900)
  expect(dock.dataset.hidden).toBe('false')
  controls.dispose()
})
it('pins playback and open menus or dialogs, then waits for a fresh user gesture', () => {
  const { dock, controls, scroll, wheel, hide } = setup()
  hide(); controls.pin(true)
  vi.advanceTimersByTime(180)
  wheel(); scroll(600); expect(dock.dataset.hidden).toBe('false')
  controls.pin(false); scroll(900); expect(dock.dataset.hidden).toBe('false')
  wheel(); scroll(1000); expect(dock.dataset.hidden).toBe('true')
  controls.dispose()
})
it('reveals on focus or hover and keeps hidden controls keyboard reachable', () => {
  const { dock, controls, scroll, wheel, hide } = setup()
  hide(); doc.activeElement = dock; dock.dispatchEvent(new Event('focusin'))
  vi.advanceTimersByTime(180)
  wheel(); scroll(600); expect(dock.dataset.hidden).toBe('false')
  doc.activeElement = null
  input(dock, 'pointerenter', { pointerType: 'mouse' })
  wheel(); scroll(900); expect(dock.dataset.hidden).toBe('false')
  dock.dispatchEvent(new Event('pointerleave'))
  wheel(); scroll(1000); expect(dock.dataset.hidden).toBe('true')
  controls.dispose()
})
it('pins short transcripts and the end, including when filtering or resizing makes it unscrollable', () => {
  const { list, dock, controls, scroll, wheel, hide } = setup()
  hide(); scroll(1576); expect(dock.dataset.hidden).toBe('false')
  vi.advanceTimersByTime(180)
  wheel(); scroll(1600); expect(dock.dataset.hidden).toBe('false')
  controls.programmatic(); scroll(0); wheel(); scroll(100)
  vi.advanceTimersByTime(120); expect(dock.dataset.hidden).toBe('true')
  list.scrollHeight = 400; Observer.all[1].change()
  expect(dock.dataset.hidden).toBe('false')
  vi.advanceTimersByTime(180)
  wheel(); scroll(0); expect(dock.dataset.hidden).toBe('false')
  controls.dispose()
})
it('accepts touch scrolling, scroll keys and scrollbar dragging, not horizontal wheel or text clicks', () => {
  const { list, dock, controls, scroll } = setup()
  input(list, 'wheel', { deltaX: 100, deltaY: 1 }); scroll(100)
  input(list, 'wheel', { deltaX: 0, deltaY: 100, ctrlKey: true }); scroll(200)
  input(list, 'pointerdown', { button: 0, clientX: 250 }); scroll(300)
  expect(dock.dataset.hidden).toBe('false')
  input(list, 'touchmove'); scroll(400); expect(dock.dataset.hidden).toBe('true')
  vi.advanceTimersByTime(120); controls.programmatic(); vi.advanceTimersByTime(180)
  input(list, 'keydown', { key: 'PageDown' }); scroll(500); expect(dock.dataset.hidden).toBe('true')
  vi.advanceTimersByTime(120); controls.programmatic(); vi.advanceTimersByTime(180)
  input(list, 'pointerdown', { button: 0, clientX: 498 })
  vi.advanceTimersByTime(1000); input(doc, 'pointermove'); scroll(600)
  expect(dock.dataset.hidden).toBe('true')
  input(doc, 'pointerup'); controls.dispose()
})
it('removes listeners, observers and pending timers on closing, deletion or switching notes', () => {
  const { list, dock, controls, scroll, hide } = setup()
  hide(); controls.dispose()
  expect(vi.getTimerCount()).toBe(0)
  for (const observer of Observer.all) expect(observer.disconnect).toHaveBeenCalledOnce()
  input(list, 'wheel', { deltaY: 200, deltaX: 0 }); scroll(300)
  expect(dock.dataset.hidden).toBeUndefined()
})

it('playback, focus and the end cancel an in-flight exit without waiting for it to hide', () => {
  const { dock, controls, scroll, wheel } = setup()
  wheel(); scroll(100); vi.advanceTimersByTime(60)
  controls.pin(true); expect(dock.dataset.hidden).toBe('false')
  vi.advanceTimersByTime(180); controls.pin(false)
  wheel(); scroll(200); vi.advanceTimersByTime(60)
  doc.activeElement = dock; dock.dispatchEvent(new Event('focusin'))
  expect(dock.dataset.hidden).toBe('false')
  vi.advanceTimersByTime(180); doc.activeElement = null
  wheel(); scroll(300); vi.advanceTimersByTime(60)
  scroll(1600); expect(dock.dataset.hidden).toBe('false')
  controls.dispose()
})

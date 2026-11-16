import { afterEach, expect, it, vi } from 'vitest'
import { attachAskTracer } from '../src/renderer/src/askTracer'
import { TRACER_DELAY_MS, TRACER_LAP_MS } from '../src/shared/askTracer'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('animates explicit dash offsets, follows the composer size, and cancels on native input and cleanup', () => {
  vi.useFakeTimers()
  const node = () => {
    const element = {
      namespaceURI: 'http://www.w3.org/2000/svg', style: {}, attrs: new Map<string, string>(),
      setAttribute(key: string, value: string) { this.attrs.set(key, value) },
      append: vi.fn(), remove: vi.fn(), animate: vi.fn(() => ({ cancel: vi.fn() })),
    }
    return element
  }
  const nodes: ReturnType<typeof node>[] = []
  const field = { value: '' }
  const doc = Object.assign(new EventTarget(), { activeElement: field, hidden: false,
    createElementNS: () => { const element = node(); nodes.push(element); return element } })
  const media = Object.assign(new EventTarget(), { matches: false })
  let bounds = { width: 400, height: 100 }, resize = () => {}
  const disconnect = vi.fn()
  const box = Object.assign(new EventTarget(), {
    querySelector: () => field, append: vi.fn(), matches: () => false,
    contains: (element: unknown) => element === field, getBoundingClientRect: () => bounds,
  })
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { matchMedia: () => media })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  const tracer = attachAskTracer(box as unknown as HTMLFormElement)
  expect(nodes).toHaveLength(21)
  expect(nodes[0].attrs.get('aria-hidden')).toBe('true')
  expect(nodes[0].attrs.get('viewBox')).toBe('0 0 400 100')
  expect(nodes[1].attrs.get('width')).toBe('398')
  bounds = { width: 350, height: 160 }; resize()
  expect(nodes[1].attrs.get('width')).toBe('348')
  expect(nodes[1].attrs.get('height')).toBe('158')
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  for (let i = 0; i < 20; i++) expect(nodes[i + 1].animate).toHaveBeenCalledWith(
    [{ strokeDashoffset: String(-i), easing: 'cubic-bezier(.37,0,.63,1)' }, { strokeDashoffset: String(-i - 100) }], { duration: TRACER_LAP_MS, easing: 'linear' })
  field.value = 'Draft'; box.dispatchEvent(new Event('input'))
  for (const element of nodes) expect(element.animate.mock.results[0].value.cancel).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(24000)
  expect(nodes[0].animate).toHaveBeenCalledOnce()
  tracer.dispose()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(nodes[0].remove).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  field.value = ''; box.dispatchEvent(new Event('focusin')); media.dispatchEvent(new Event('change'))
  expect(vi.getTimerCount()).toBe(0)
})

it('plays the opening under a resting pointer, but movement inside the box cancels it', () => {
  vi.useFakeTimers()
  const nodes: { animate: ReturnType<typeof vi.fn> }[] = []
  const field = { value: '' }
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field, hidden: false,
    createElementNS: () => { const element = { namespaceURI: '', style: {}, setAttribute() {}, append() {}, remove() {}, animate: vi.fn(() => ({ cancel() {} })) }; nodes.push(element); return element } }))
  vi.stubGlobal('window', { matchMedia: () => Object.assign(new EventTarget(), { matches: false }) })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const open = () => {
    nodes.length = 0
    const box = Object.assign(new EventTarget(), { querySelector: () => field, append() {}, matches: () => true,
      contains: (element: unknown) => element === field, getBoundingClientRect: () => ({ width: 400, height: 100 }) })
    return { box, tracer: attachAskTracer(box as unknown as HTMLFormElement) }
  }
  const resting = open()
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  expect(nodes[0].animate).toHaveBeenCalledOnce()
  resting.tracer.dispose()
  const moving = open()
  moving.box.dispatchEvent(new Event('pointermove'))
  vi.advanceTimersByTime(TRACER_DELAY_MS)
  expect(nodes[0].animate).not.toHaveBeenCalled()
  moving.tracer.dispose()
})

import { afterEach, expect, it, vi } from 'vitest'
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { TranscriptFind } from '../src/renderer/src/components/TranscriptFind'
import { LOCALES } from '../src/shared/i18n'
import { transcriptDom } from './transcriptFindDom'

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(), useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn(), useLayoutEffect: vi.fn(),
  useMemo: (make: () => unknown) => make(), useId: () => 'find-count',
}))
vi.mock('../src/renderer/src/i18n', () => ({ useLanguage() {} }))
vi.mock('react-dom', () => ({ createPortal: (child: ReactNode) => child }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

function find(node: ReactNode, id: string): ReactElement<any> {
  const visit = (value: ReactNode): ReactElement<any> | undefined => {
    if (Array.isArray(value)) return value.map(visit).find(Boolean)
    if (!value || typeof value !== 'object' || !('props' in value)) return
    const element = value as ReactElement<any>
    return element.props['data-testid'] === id || element.props.className === id ? element : visit(element.props.children)
  }
  const result = visit(node)
  if (!result) throw new Error(`Missing ${id}`)
  return result
}

// Run the real handlers and highlight effects without a browser or Electron.
function harness(parts?: Parameters<typeof transcriptDom>[0], text = 'test test') {
  const states: unknown[] = [], refs: { current: unknown }[] = []
  const effects: { deps?: readonly unknown[]; cleanup?: () => void }[] = []
  let tree: ReactNode, dirty = false
  const dom = transcriptDom(parts)
  let mutated = () => {}
  vi.stubGlobal('MutationObserver', class { constructor(fn: () => void) { mutated = fn } observe() {} disconnect() {} })
  const highlights = new Map<string, Set<unknown>>()
  const input = { focus: vi.fn(), select: vi.fn(), getBoundingClientRect: () => ({ bottom: 0 }) }
  const trigger = { focus: vi.fn() }
  const control = { querySelector: () => null, contains: (target: unknown) => target === input }
  const onFinding = vi.fn()
  const listeners = new Map<string, (event: unknown) => void>()
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) })
  vi.stubGlobal('document', { querySelector: () => null })
  vi.stubGlobal('CSS', { highlights })
  vi.stubGlobal('Highlight', class extends Set { constructor(...ranges: unknown[]) { super(ranges) } })
  const list = { current: dom.list }
  const lines = [{ track: 'me', startMs: 0, text }]
  const render = () => {
    let passes = 0
    do {
    if (++passes > 20) throw new Error('Render loop')
    dirty = false
    let state = 0, ref = 0
    vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, (next: unknown) => void] => {
      const i = state++
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], next => { const value = typeof next === 'function' ? next(states[i]) : next; if (!Object.is(value, states[i])) { states[i] = value; dirty = true } }]
    })
    vi.mocked(useRef).mockImplementation(initial => refs[ref++] ??= { current: initial })
    vi.mocked(useEffect).mockClear(); vi.mocked(useLayoutEffect).mockClear()
    tree = TranscriptFind({ lines, list, active: true, playbackInset: 0, onFinding })
    find(tree, 'transcript-search').props.ref.current = input
    find(tree, 'transcript-find-open').props.ref.current = trigger
    find(tree, 'transcript-toolbar').props.ref.current = control
    let effectIndex = 0
    for (const [effect, deps] of [...vi.mocked(useLayoutEffect).mock.calls, ...vi.mocked(useEffect).mock.calls]) {
      const index = effectIndex++, old = effects[index]
      if (!old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i]))) {
        old?.cleanup?.(); effects[index] = { deps, cleanup: effect() || undefined }
      }
    }
    } while (dirty)
    return tree
  }
  render()
  return { render, highlights, trigger, input, onFinding, dom, mutate: () => mutated(),
    get: (id: string) => find(tree, id),
    escape: () => listeners.get('keydown')!({ key: 'Escape', target: input, preventDefault() {}, stopPropagation() {} }),
  }
}

it.each(['', 'test', 'absent'])('keeps Close available and clears find for query %j', query => {
  for (const closeWith of ['button', 'escape']) {
    const h = harness()
    h.get('transcript-find-open').props.onClick(); h.render()
    h.get('transcript-search').props.onChange({ target: { value: query } }); h.render()
    const button = h.get('transcript-find-close')
    expect(button.props.disabled).toBeFalsy()
    expect(button.props['aria-label']).toBe('Close')
    expect(button.props.title).toBe('Close (Esc)')
    expect(button.props['aria-keyshortcuts']).toBe('Escape')
    expect(find(h.get('transcript-find-controls').props.children[1], 'transcript-find-close')).toBe(button)
    expect(h.get('transcript-find-results').props.inert).toBe(!query)
    expect(h.highlights.get('transcript-find')?.size).toBe(query === 'test' ? 2 : 0)
    expect(h.get('transcript-find-next').props.disabled).toBe(query !== 'test')
    if (closeWith === 'button') button.props.onClick(); else h.escape()
    h.render()
    expect(h.get('transcript-find-open').props['aria-expanded']).toBe(false)
    expect(h.get('transcript-find-clip').props.inert).toBe(true)
    expect(h.get('transcript-search').props.value).toBe('')
    expect(h.highlights.get('transcript-find')?.size).toBe(0)
    expect(h.highlights.get('transcript-find-current')?.size).toBe(0)
    expect(h.trigger.focus).toHaveBeenLastCalledWith({ preventScroll: true })
    expect(h.onFinding).toHaveBeenLastCalledWith(false)
    h.get('transcript-find-open').props.onClick(); h.render()
    expect(h.get('transcript-search').props.value).toBe('')
  }
})

it('provides the Close label in every supported language', () => {
  const tables = import.meta.glob<Record<string, string>>('../src/shared/locales/*.json', { eager: true, import: 'default' })
  expect(LOCALES).toHaveLength(32)
  for (const { id } of LOCALES) expect(tables[`../src/shared/locales/${id}.json`].Close?.trim(), id).toBeTruthy()
})


it('places a match spanning nested text nodes without throwing', () => {
  const h = harness(['', ['te', 'st '], ['te', 'st']])
  h.get('transcript-find-open').props.onClick(); h.render()
  h.get('transcript-search').props.onChange({ target: { value: 'test test' } })
  expect(() => h.render()).not.toThrow()
  const ranges = [...h.highlights.get('transcript-find')!] as Range[]
  expect(ranges).toHaveLength(1)
  expect(ranges[0].toString()).toBe('test test')
  expect(ranges[0].startContainer).not.toBe(ranges[0].endContainer)
})

it('searches rendered text and refreshes ranges when word nodes change', () => {
  const h = harness(['visible ', ['test']], 'stale source text')
  h.get('transcript-find-open').props.onClick(); h.render()
  h.get('transcript-search').props.onChange({ target: { value: 'test' } }); h.render()
  expect(h.get('transcript-find-count').props.children[2].props.children).toBe('1 of 1')
  h.dom.nodes[1].data = 'test test'
  h.mutate(); h.render()
  expect(h.get('transcript-find-count').props.children[2].props.children).toBe('1 of 2')
  expect([...h.highlights.get('transcript-find')!].map(range => String(range))).toEqual(['test', 'test'])
  h.get('transcript-find-next').props.onClick(); h.render()
  h.dom.nodes[1].data = 'test test test'
  h.mutate(); h.render()
  expect(h.get('transcript-find-count').props.children[2].props.children).toBe('2 of 3')
})

it('opens on one click without focusing inert content or letting an opening blur cancel it', () => {
  const h = harness()
  const closed = h.get('transcript-find')
  h.get('transcript-find-open').props.onClick()
  expect(h.input.focus).not.toHaveBeenCalled()
  expect(h.input.select).not.toHaveBeenCalled()
  closed.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null })
  h.render()
  expect(h.get('transcript-find-open').props['aria-expanded']).toBe(true)
  expect(h.input.focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(h.input.select).toHaveBeenCalledOnce()
  h.get('transcript-find').props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null })
  h.render()
  expect(h.get('transcript-find-open').props['aria-expanded']).toBe(false)
})


it('reveals the new query rather than consuming its scroll request on stale results', () => {
  const h = harness(['test ', ['other']], 'test other')
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
    const top = this.toString() === 'other' ? 1500 : 500
    return { top, bottom: top + 20, height: 20 } as DOMRect
  })
  h.get('transcript-find-open').props.onClick(); h.render()
  h.get('transcript-search').props.onChange({ target: { value: 'test' } }); h.render()
  h.get('transcript-search').props.onChange({ target: { value: 'other' } }); h.render()
  expect(h.dom.list.scrollTo).toHaveBeenLastCalledWith({ top: 1235, behavior: 'smooth' })
})

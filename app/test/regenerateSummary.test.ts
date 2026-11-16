import { createElement, useLayoutEffect, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { RegenerateForm } from '../src/renderer/src/components/RegenerateForm'
import { LOCALES, setLanguage, t } from '../src/shared/i18n'
import { REWRITE_NOTE_MAX } from '../src/shared/rewriteNote'

const state = vi.hoisted(() => ({ note: '', setNote: vi.fn() }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [state.note, state.setNote], useLayoutEffect: vi.fn() }))
afterEach(() => { state.note = ''; vi.clearAllMocks(); setLanguage('en') })

function form(edited = false, disabled = false) {
  const onSubmit = vi.fn(), onClose = vi.fn()
  const tree = RegenerateForm({ hasSummary: true, active: true, edited, disabled, onSubmit, onClose })
  const find = (node: any, type: string): ReactElement<any> | undefined => {
    if (!node || typeof node !== 'object') return
    if (node.type === type) return node
    for (const child of [node.props?.children].flat()) { const found = find(child, type); if (found) return found }
  }
  return { tree, onSubmit, onClose, input: find(tree, 'input')!, close: find(tree, 'button')! }
}

it('submits an optional trimmed note, closes without submitting, and respects disabled generation', () => {
  for (const note of ['', '  ', '  shorter in Spanish  ']) {
    state.note = note
    const f = form(), preventDefault = vi.fn()
    f.tree.props.onSubmit({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(f.onSubmit).toHaveBeenCalledWith(note.trim())
    f.close.props.onClick()
    expect(f.onClose).toHaveBeenCalledOnce()
    expect(f.onSubmit).toHaveBeenCalledOnce()
  }
  const disabled = form(false, true)
  disabled.tree.props.onSubmit({ preventDefault() {} })
  expect(disabled.onSubmit).not.toHaveBeenCalled()
})

it('limits a single-line field and does not submit while an input method is composing', () => {
  const f = form(), preventDefault = vi.fn()
  expect(f.input.props.maxLength).toBe(REWRITE_NOTE_MAX)
  expect(f.input.props.autoFocus).toBe(true)
  f.input.props.onChange({ target: { value: 'shorter' } })
  expect(state.setNote).toHaveBeenCalledWith('shorter')
  f.input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
})

it('shows the edit warning only when needed and translates every new label', () => {
  for (const locale of LOCALES) {
    setLanguage(locale.id)
    for (const key of ['Note for the summary', 'Add a note, like shorter or in Spanish', 'Regenerate']) {
      if (locale.id !== 'en') expect(t(key), locale.id).not.toBe(key)
    }
    const render = (edited: boolean) => renderToStaticMarkup(createElement(RegenerateForm, { hasSummary: true, active: true, edited, disabled: false, onClose() {}, onSubmit() {} }))
    expect(render(true)).toContain('data-testid="note-confirm"')
    expect(render(false)).not.toContain('data-testid="note-confirm"')
    expect(render(true)).not.toContain('type="checkbox"')
  }
})

it('clears a note on reopening while preserving its text during the exit', () => {
  RegenerateForm({ hasSummary: true, active: false, edited: false, disabled: false, onClose() {}, onSubmit() {} })
  vi.mocked(useLayoutEffect).mock.calls.at(-1)![0]()
  expect(state.setNote).not.toHaveBeenCalled()
  RegenerateForm({ hasSummary: true, active: true, edited: false, disabled: false, onClose() {}, onSubmit() {} })
  vi.mocked(useLayoutEffect).mock.calls.at(-1)![0]()
  expect(state.setNote).toHaveBeenCalledWith('')
})

it('labels the optional-note form for first generation when no summary exists', () => {
  const html = renderToStaticMarkup(createElement(RegenerateForm, { hasSummary: false, active: true, edited: false, disabled: false, onClose() {}, onSubmit() {} }))
  expect(html).toContain('Generate summary')
  expect(html).not.toContain('Regenerate summary')
})

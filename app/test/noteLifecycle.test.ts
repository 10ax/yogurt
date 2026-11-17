import { afterEach, expect, it, vi } from 'vitest'
import { installNoteLifecycle } from '../src/renderer/src/noteLifecycle'
import { NoteAutosave, registerAutosave } from '../src/renderer/src/noteAutosave'

afterEach(() => { vi.unstubAllGlobals() })
function setup() {
  let request!: (closing: boolean) => Promise<boolean>
  const off = vi.fn()
  const win = Object.assign(new EventTarget(), { yogurt: { notes: { onFlushRequest: (fn: typeof request) => { request = fn; return off } } } })
  const doc = Object.assign(new EventTarget(), { body: { inert: false }, visibilityState: 'visible' })
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc)
  const stop = installNoteLifecycle()
  return { win, doc, off, stop, request: (closing: boolean) => request(closing) }
}
it('still acknowledges quit after the failed App unmounts its editor and hands off the latest edit', async () => {
  const life = setup()
  const save = vi.fn(async ({ revision }: { revision: number }) => ({ revision, status: 'saved' as const }))
  const handoff = vi.fn(({ revision }: { revision: number }) => ({ revision, status: 'saved' as const }))
  const editor = new NoteAutosave(save, handoff), unmount = registerAutosave(editor)
  editor.change('latest unsaved edit')
  unmount()
  expect(handoff).toHaveBeenCalledWith({ text: 'latest unsaved edit', revision: 1 })
  expect(life.off).not.toHaveBeenCalled()
  expect(await life.request(true)).toBe(true)
  expect(life.doc.body.inert).toBe(true)
  expect(await life.request(false)).toBe(true)
  expect(life.doc.body.inert).toBe(false)
  life.stop(); expect(life.off).toHaveBeenCalledOnce()
})
it('keeps a failed handoff retryable after unmount and never hides a genuine save failure', async () => {
  const life = setup()
  let recovered = false
  const result = ({ revision }: { revision: number }) => ({ revision, status: recovered ? 'saved' as const : 'failed' as const })
  const editor = new NoteAutosave(async e => result(e), result), unmount = registerAutosave(editor)
  editor.change('retained in renderer'); unmount()
  expect(await life.request(true)).toBe(false)
  await life.request(false)
  const unload = new Event('beforeunload', { cancelable: true })
  life.win.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  recovered = true
  expect(await life.request(true)).toBe(true)
  unmount(); life.stop()
})

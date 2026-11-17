import { flushOpenNotes, handoffOpenNotes } from './noteAutosave'

/** Window lifetime, not App lifetime: a failed React tree must still answer main's save request. */
export function installNoteLifecycle() {
  const off = window.yogurt.notes.onFlushRequest(closing => {
    document.body.inert = closing
    return closing ? flushOpenNotes() : Promise.resolve(true)
  })
  const handoff = (event: BeforeUnloadEvent) => {
    if (!handoffOpenNotes()) { event.preventDefault(); event.returnValue = '' }
  }
  const hidden = () => { if (document.visibilityState === 'hidden') void flushOpenNotes() }
  window.addEventListener('beforeunload', handoff)
  document.addEventListener('visibilitychange', hidden)
  return () => { off(); window.removeEventListener('beforeunload', handoff); document.removeEventListener('visibilitychange', hidden) }
}

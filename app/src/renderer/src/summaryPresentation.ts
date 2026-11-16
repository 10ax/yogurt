import { useEffect, useState } from 'react'
import { motion } from './motion'
import type { NoteView } from '../../shared/types'

/** A saved result stays on screen until the replacement starts writing. */
export function summaryPresentation(notes: Pick<NoteView, 'status' | 'enhanced' | 'draft'>) {
  if (notes.status === 'waiting' || notes.status === 'writing') {
    if (notes.enhanced != null && !/[\p{L}\p{N}]/u.test(notes.draft)) return 'rewriting'
    return notes.draft ? 'streaming' : 'waiting'
  }
  if (notes.enhanced != null) return 'saved'
  if (notes.status === 'failed') return 'failed'
  if (notes.status === 'empty') return 'empty'
  if (notes.status === 'stopped') return 'stopped'
  return 'saved'
}

/** Start the first-summary sequence only after the old reading surface has faded. */
export function useSummaryPresentation(notes: NoteView | undefined, reduced: boolean) {
  const presentation = notes ? summaryPresentation(notes) : 'saved'
  const id = notes?.meetingId
  const [last, setLast] = useState({ id, presentation, fading: false, resetting: false })
  if (last.id !== id || last.presentation !== presentation) {
    setLast({ id, presentation, resetting: reduced && last.id === id && last.presentation === 'rewriting' && presentation === 'streaming', fading: !reduced && last.id === id && last.presentation === 'rewriting' && presentation === 'streaming' })
  }
  useEffect(() => {
    if (last.resetting) {
      const frame = requestAnimationFrame(() => setLast(s => ({ ...s, resetting: false })))
      return () => cancelAnimationFrame(frame)
    }
    if (!last.fading) return
    if (reduced) { setLast(s => ({ ...s, fading: false, resetting: true })); return }
    const timer = setTimeout(() => setLast(s => ({ ...s, fading: false, resetting: true })), motion.micro)
    return () => clearTimeout(timer)
  }, [last.fading, last.resetting, reduced, id])
  return last.resetting || last.fading && reduced ? 'reset' : last.fading ? 'handoff' : presentation
}

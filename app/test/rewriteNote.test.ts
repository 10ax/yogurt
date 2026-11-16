import { expect, it } from 'vitest'
import { rewriteNote } from '../src/main/ipcArgs'
import { REWRITE_NOTE_MAX } from '../src/shared/rewriteNote'

it('accepts missing and blank IPC notes as the original regeneration', () => {
  for (const value of [undefined, '', '  \n\t']) expect(rewriteNote(value)).toBe('')
  expect(rewriteNote('  shorter, in Spanish  ')).toBe('shorter, in Spanish')
})

it('rejects non-text IPC notes and caps text before it reaches the model', () => {
  for (const value of [null, false, 42, {}, [], ['shorter']]) expect(rewriteNote(value)).toBeUndefined()
  expect(rewriteNote('x'.repeat(REWRITE_NOTE_MAX + 1))).toBe('x'.repeat(REWRITE_NOTE_MAX))
})

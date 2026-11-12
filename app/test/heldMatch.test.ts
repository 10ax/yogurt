import { expect, it } from 'vitest'
import { heldMatch } from '../src/main/notes/model'

it('says whether a prompt builds on what was read ahead, where it parts, and never the text itself', () => {
  expect(heldMatch('', 'anything')).toMatch(/nothing read ahead/)
  expect(heldMatch('Here is the transcript\nYou: hi', 'Here is the transcript\nYou: hi\nThem: hello')).toBe('reuses all 30 chars read ahead')
  const msg = heldMatch('Here is the transcript\nYou: hi there', 'Here is the transcript\nDana: hi there')
  expect(msg).toBe('differs from what was read ahead at char 23 of 36 (line 2): read again from there')
  expect(msg).not.toContain('hi there')
})

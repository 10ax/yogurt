import { describe, expect, it } from 'vitest'
import { withoutPreamble } from '../src/shared/answerPreamble'

describe('withoutPreamble: an answer starts with the answer, never with where it came from', () => {
  it('drops a line that only says what the answer is based on', () => {
    expect(withoutPreamble('Based on the provided transcript:\n- **Last week:** no open PRs [1]')).toBe('- **Last week:** no open PRs [1]')
    expect(withoutPreamble('Based on the provided transcripts:\n\nMicah is on the product map [2].')).toBe('Micah is on the product map [2].')
    expect(withoutPreamble('According to the meeting notes:\n- a')).toBe('- a')
    expect(withoutPreamble('Based on the sources provided, here is what Micah is working on:\n- a')).toBe('- a')
  })
  it('drops the clause before the answer in the same sentence, and starts it with a capital', () => {
    expect(withoutPreamble('Based on the transcript, Micah had no open PRs [1].')).toBe('Micah had no open PRs [1].')
    expect(withoutPreamble('According to the provided sources, the launch moved to May [3].')).toBe('The launch moved to May [3].')
  })
  it('keeps answers that only start like one', () => {
    expect(withoutPreamble('Based on what Dana said, the launch moved [1].')).toBe('Based on what Dana said, the launch moved [1].')
    expect(withoutPreamble('Micah had no open PRs [1].')).toBe('Micah had no open PRs [1].')
    expect(withoutPreamble('According to Dana, the launch moved [1].')).toBe('According to Dana, the launch moved [1].')
  })
  it('while streaming, holds back the first words until it is clear they are no such line', () => {
    expect(withoutPreamble('Based on the pro', { streaming: true })).toBe('')
    expect(withoutPreamble('Based on the provided transcript:', { streaming: true })).toBe('')
    expect(withoutPreamble('Based on the provided transcript:\n- **Last', { streaming: true })).toBe('- **Last')
    expect(withoutPreamble('Micah', { streaming: true })).toBe('Micah')
    expect(withoutPreamble('Based on what Dana said,', { streaming: true })).toBe('Based on what Dana said,')
  })
})

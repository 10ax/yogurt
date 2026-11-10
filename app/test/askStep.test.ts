import { describe, expect, it } from 'vitest'
import { stepText, STEP_EVERY_MS } from '../src/shared/askStep'

describe('stepText: what an answer that has not started says it is doing', () => {
  it('waiting in line, or with no step yet, it is getting ready', () => {
    expect(stepText(undefined, 0)).toBe('Getting ready…')
  })
  it('names the step that runs: loading, searching, reading one meeting or several', () => {
    expect(stepText({ kind: 'loading' }, 0)).toBe('Getting ready…')
    expect(stepText({ kind: 'searching' }, 0)).toBe('Searching your meetings…')
    expect(stepText({ kind: 'reading', title: 'Standup' }, 0)).toBe('Reading Standup…')
    expect(stepText({ kind: 'reading', meetings: 3 }, 0)).toBe('Reading 3 meetings…')
    expect(stepText({ kind: 'reading', meetings: 1 }, 0)).toBe('Reading 1 meeting…')
    expect(stepText({ kind: 'reading', title: '  ' }, 0)).toBe('Reading Untitled meeting…')
  })
  it('a long step says it is still on it, then stays on the last wording', () => {
    const read = { kind: 'reading' as const, title: 'Standup' }
    expect(stepText(read, 1)).toBe('Still reading Standup…')
    expect(stepText(read, 2)).toBe('Still reading. Your answer comes next.')
    expect(stepText(read, 9)).toBe('Still reading. Your answer comes next.')
    expect(stepText({ kind: 'loading' }, 5)).toBe('Still getting ready…')
    expect(stepText({ kind: 'searching' }, 5)).toBe('Still searching your meetings…')
    expect(stepText({ kind: 'reading', meetings: 4 }, 1)).toBe('Still reading 4 meetings…')
    expect(STEP_EVERY_MS).toBe(4000)
  })
})

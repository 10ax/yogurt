import { describe, expect, it } from 'vitest'
import { stepTranscriptMatch, transcriptMatches, transcriptMatchIndex, transcriptFindScrollTop } from '../src/shared/transcriptFind'

const line = (text: string, startMs = 0, track = 'me') => ({ text, startMs, track })
describe('finding in the transcript', () => {
  it('counts occurrences instead of removing surrounding lines', () => {
    const lines = [line('A test, another TEST, and the latest plan.'), line('Keep this context.', 1000)]
    const copy = structuredClone(lines)
    expect(transcriptMatches(lines, 'test')).toEqual([
      { key: 'me:0', start: 2, end: 6 }, { key: 'me:0', start: 16, end: 20 }, { key: 'me:0', start: 32, end: 36 },
    ])
    expect(lines).toEqual(copy)
  })
  it('finds literal phrases and punctuation without treating input as a pattern', () => {
    expect(transcriptMatches([line('Review [a+b] now. Then [a+b].')], '[a+b]')).toHaveLength(2)
    expect(transcriptMatches([line('release plan and plan release')], ' release plan ')).toHaveLength(1)
    expect(transcriptMatches([line('aaaa')], 'aa')).toHaveLength(2)
    expect(transcriptMatches([line('text')], '  ')).toEqual([])
    expect(transcriptMatches([line('text')], 'absent')).toEqual([])
  })
  it('keeps original offsets for Unicode, surrogate pairs and case folding', () => {
    for (const [text, query, expected] of [
      ['🙂 CAFÉ café', 'café', ['CAFÉ', 'café']],
      ['İtest TEST', 'test', ['test', 'TEST']],
      ['你好你好', '你好', ['你好', '你好']],
      ['🙂🙂', '🙂', ['🙂', '🙂']],
    ] as const) expect(transcriptMatches([line(text)], query).map(hit => text.slice(hit.start, hit.end))).toEqual(expected)
  })
  it('wraps in both directions, including empty and single results', () => {
    expect(stepTranscriptMatch(0, -1, 12)).toBe(11)
    expect(stepTranscriptMatch(11, 1, 12)).toBe(0)
    expect(stepTranscriptMatch(0, 1, 0)).toBe(0)
    expect(stepTranscriptMatch(0, -1, 1)).toBe(0)
  })
  it('keeps the current occurrence when live lines append or an earlier track settles', () => {
    const original = [line('test test', 1000), line('test again', 2000, 'them')]
    const selected = transcriptMatches(original, 'test')[1]
    const appended = transcriptMatches([...original, line('test test', 3000)], 'test')
    expect(appended).toHaveLength(5)
    expect(transcriptMatchIndex(appended, selected)).toBe(1)
    const settled = transcriptMatches([line('test', 500, 'them'), ...original, line('test', 3000)], 'test')
    expect(transcriptMatchIndex(settled, selected)).toBe(2)
    expect(settled[transcriptMatchIndex(settled, selected)]).toEqual(selected)
    expect(transcriptMatchIndex([], selected)).toBe(0)
    expect(transcriptMatchIndex(transcriptMatches([line('test', 4000)], 'test'), selected)).toBe(0)
  })
  it('indexes a dense three-hour transcript without changing its lines', () => {
    const lines = Array.from({ length: 5400 }, (_, i) => line('Review the release plan. Test the recording and test the summary before the next release.', i * 2000, i % 2 ? 'me' : 'them'))
    const start = performance.now()
    const matches = transcriptMatches(lines, 'test')
    expect(matches).toHaveLength(10800)
    expect(transcriptMatchIndex(matches, matches.at(-1)!)).toBe(10799)
    expect(performance.now() - start).toBeLessThan(100)
  })
})

it('only scrolls obscured matches and centres them below floating controls', () => {
  const view = { top: 100, bottom: 500, scrollTop: 300 }
  expect(transcriptFindScrollTop({ top: 100, bottom: 120 }, view)).toBeNull()
  expect(transcriptFindScrollTop({ top: 480, bottom: 500 }, view)).toBeNull()
  expect(transcriptFindScrollTop({ top: 600, bottom: 620 }, view)).toBe(610)
  expect(transcriptFindScrollTop({ top: 80, bottom: 120 }, view)).toBe(100)
  expect(transcriptFindScrollTop({ top: 105, bottom: 125 }, { ...view, top: 150 })).toBe(90)
})

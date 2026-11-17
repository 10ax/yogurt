import { afterEach, expect, it, vi } from 'vitest'
import { transcriptFindRanges } from '../src/renderer/src/transcriptFindRanges'
import { transcriptDom } from './transcriptFindDom'

afterEach(() => vi.unstubAllGlobals())
const lines = [{ track: 'me', startMs: 0, text: 'outdated model text' }]

it('maps literal UTF-16 offsets across nested rendered nodes and node boundaries', () => {
  const { list } = transcriptDom(['🙂 ', ['CA', 'FÉ'], ' café'])
  const result = transcriptFindRanges(list, lines, 'café')
  expect(result.matches).toEqual([{ key: 'me:0', start: 3, end: 7 }, { key: 'me:0', start: 8, end: 12 }])
  expect(result.ranges.map(String)).toEqual(['CAFÉ', 'café'])
})

it('skips failed placements without throwing or misaligning navigation and counts', () => {
  const { list, doc } = transcriptDom(['test ', ['test']])
  doc.createRange.mockImplementationOnce(() => { throw new Error('Detached boundary') })
  const result = transcriptFindRanges(list, lines, 'test')
  expect(result.matches).toEqual([{ key: 'me:0', start: 5, end: 9 }])
  expect(result.ranges.map(String)).toEqual(['test'])
})

it('skips missing, disconnected and changed text rather than painting stale matches', () => {
  const { list, root, doc, nodes } = transcriptDom(['test'])
  root.isConnected = false
  expect(transcriptFindRanges(list, lines, 'test').ranges).toEqual([])
  root.isConnected = true
  doc.createRange.mockImplementationOnce(() => { nodes[0].data = ''; return new Range() as any })
  expect(() => transcriptFindRanges(list, lines, 'test')).not.toThrow()
  expect(transcriptFindRanges(list, [{ ...lines[0], startMs: 1 }], 'test').matches).toEqual([])
})

it('indexes a three-hour transcript with split text and a range for every counted hit', () => {
  const { list, root } = transcriptDom(['te', ['st '], 'test'])
  const rows = Array.from({ length: 5400 }, (_, i) => ({ track: 'me', startMs: i * 2000, text: 'model' }))
  list.querySelectorAll = (() => rows.map(row => ({ dataset: { key: `me:${row.startMs}` }, querySelector: () => root }))) as any
  const result = transcriptFindRanges(list, rows, 'test')
  expect(result.matches).toHaveLength(10800)
  expect(result.ranges).toHaveLength(10800)
  expect(result.ranges.every(range => range.toString() === 'test')).toBe(true)
})

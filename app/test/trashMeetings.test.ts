import { expect, it, vi } from 'vitest'
import { restoreMeetings, trashMeetings } from '../src/renderer/src/trashMeetings'

it('trashes each selected meeting once and returns one set for Undo', async () => {
  const trash = vi.fn(async () => 'trashed' as const)
  expect(await trashMeetings(['a', 'b', 'a'], trash)).toEqual({ trashed: ['a', 'b'], done: ['a', 'b'], error: undefined })
  expect(trash.mock.calls).toHaveLength(2)
})

it('continues after failures, leaving failed meetings selected and out of Undo', async () => {
  const trash = vi.fn(async (id: string) => {
    if (id === 'throws') throw new Error('Unavailable')
    const results: Record<string, 'trashed' | 'save-pending' | 'recording' | 'missing' | 'failed'> = { a: 'trashed', b: 'save-pending', c: 'recording', d: 'missing', e: 'failed', f: 'trashed' }
    return results[id]
  })
  expect(await trashMeetings(['a', 'b', 'c', 'd', 'e', 'throws', 'f'], trash)).toEqual({
    trashed: ['a', 'f'], done: ['a', 'd', 'f'], error: 'save-pending',
  })
  expect(trash).toHaveBeenCalledTimes(7)
})

it('reports a rejected trash call without rejecting the whole operation', async () => {
  expect(await trashMeetings(['a'], async () => { throw new Error('Unavailable') })).toEqual({ trashed: [], done: [], error: 'failed' })
})

it('Undo tries every meeting and retries only the ones that failed', async () => {
  const restore = vi.fn(async (id: string) => { if (id === 'b') throw new Error('Unavailable') })
  const retry = await restoreMeetings(['a', 'b', 'c'], restore)
  expect(retry).toEqual(['b'])
  expect(restore.mock.calls).toEqual([['a'], ['b'], ['c']])
  restore.mockReset().mockResolvedValue(undefined)
  expect(await restoreMeetings(retry, restore)).toEqual([])
  expect(restore.mock.calls).toEqual([['b']])
})

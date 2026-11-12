import { afterEach, expect, it, vi } from 'vitest'
import { addMeetingsToFolder, setMeetingsInFolder } from '../src/renderer/src/folders'
import { folderCheck, nextFolderCheck, reconcileFolderChecks } from '../src/renderer/src/folderSelection'

afterEach(() => vi.unstubAllGlobals())

it('shows all, some and none from the selected meetings, ignoring other rows', () => {
  const memberships = { a: ['all', 'some'], b: ['all'], outside: ['none'] }
  expect(folderCheck(['a', 'b'], memberships, 'all')).toBe(true)
  expect(folderCheck(['a', 'b'], memberships, 'some')).toBe('mixed')
  expect(folderCheck(['a', 'b'], memberships, 'none')).toBe(false)
  expect(folderCheck(['a'], memberships, 'some')).toBe(true)
  expect(folderCheck(['b'], memberships, 'some')).toBe(false)
  expect(folderCheck([], memberships, 'all')).toBe(false)
})

it('adds on empty or mixed and removes on checked, including a single selected meeting', () => {
  expect(nextFolderCheck(false)).toBe(true)
  expect(nextFolderCheck('mixed')).toBe(true)
  expect(nextFolderCheck(true)).toBe(false)
  expect(nextFolderCheck(folderCheck(['a'], { a: ['folder'] }, 'folder'))).toBe(false)
})

it('keeps optimism through partial and unrelated refreshes until the saved data agrees', () => {
  const source = { a: [], b: [] }
  const pending = { folder: { checked: true, saving: false, source } }
  expect(reconcileFolderChecks(pending, ['a', 'b'], { a: ['other'], b: [] })).toBe(pending)
  expect(reconcileFolderChecks(pending, ['a', 'b'], { a: ['folder'], b: [] })).toBe(pending)
  expect(reconcileFolderChecks(pending, ['a', 'b'], { a: ['folder'], b: ['folder'] })).toEqual({})
})

it('does not clear a second toggle against the unchanged snapshot from before the first write', () => {
  const source = { a: [] }
  const pending = { folder: { checked: false, saving: false, source } }
  expect(reconcileFolderChecks(pending, ['a'], source)).toBe(pending)
  expect(reconcileFolderChecks(pending, ['a'], { a: ['folder'] })).toBe(pending)
  expect(reconcileFolderChecks(pending, ['a'], { a: [] })).toEqual({})
})

it('waits for the write to finish even if a refresh already agrees, and preserves other pending toggles', () => {
  const source = { a: [] }
  const pending = { folder: { checked: true, saving: true, source }, other: { checked: true, saving: false, source } }
  const real = { a: ['folder'] }
  expect(reconcileFolderChecks(pending, ['a'], real)).toBe(pending)
  expect(reconcileFolderChecks({ ...pending, folder: { ...pending.folder, saving: false } }, ['a'], real)).toEqual({ other: pending.other })
})

it('adds every selected meeting once while preserving other folder memberships', async () => {
  const memberships = new Map([['a', new Set(['existing'])], ['b', new Set<string>()]])
  const add = vi.fn(async (folder: string, id: string) => { memberships.get(id)!.add(folder) })
  vi.stubGlobal('window', { yogurt: { folders: { add, of: async (id: string) => [...memberships.get(id)!].map(id => ({ id })) } } })
  await addMeetingsToFolder('new', ['a', 'b', 'a'])
  expect(add.mock.calls).toEqual([['new', 'a'], ['new', 'b']])
  expect([...memberships.get('a')!]).toEqual(['existing', 'new'])
  expect([...memberships.get('b')!]).toEqual(['new'])
})

it('waits for every write and reports rejection or a missing folder', async () => {
  const add = vi.fn(async (_folder: string, id: string) => { if (id === 'a') throw new Error('Unavailable') })
  const of = vi.fn(async () => [])
  vi.stubGlobal('window', { yogurt: { folders: { add, of } } })
  await expect(addMeetingsToFolder('gone', ['a', 'b'])).rejects.toThrow('Folder not added')
  expect(add).toHaveBeenCalledTimes(2)
  expect(of).toHaveBeenCalledWith('b')
  await expect(addMeetingsToFolder('gone', ['b'])).rejects.toThrow('Folder not added')
})

it('removes every selected meeting once without touching its other folders', async () => {
  const memberships = new Map([['a', new Set(['target', 'other'])], ['b', new Set(['target'])]])
  const remove = vi.fn(async (folder: string, id: string) => { memberships.get(id)!.delete(folder) })
  vi.stubGlobal('window', { yogurt: { folders: { remove, of: async (id: string) => [...memberships.get(id)!].map(id => ({ id })) } } })
  await setMeetingsInFolder('target', ['a', 'b', 'a'], false)
  expect(remove.mock.calls).toEqual([['target', 'a'], ['target', 'b']])
  expect([...memberships.get('a')!]).toEqual(['other'])
  expect([...memberships.get('b')!]).toEqual([])
})

it('reports failed removals after trying the entire selection', async () => {
  const remove = vi.fn(async (_folder: string, id: string) => { if (id === 'a') throw new Error('Unavailable') })
  vi.stubGlobal('window', { yogurt: { folders: { remove, of: async () => [{ id: 'target' }] } } })
  await expect(setMeetingsInFolder('target', ['a', 'b'], false)).rejects.toThrow('Folder not removed')
  expect(remove).toHaveBeenCalledTimes(2)
})

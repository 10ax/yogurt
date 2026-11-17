import { afterEach, expect, it, vi } from 'vitest'
import { People } from '../src/renderer/src/components/People'
import type { Meeting } from '../src/shared/types'

// Exercise grouped row callbacks with original indices without a browser.
const hooks = vi.hoisted(() => ({ values: [] as any[], index: 0 }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const index = hooks.index++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (next: any) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }]
  },
  useRef: () => ({ current: null }), useId: () => 'people', useCallback: (fn: unknown) => fn, useEffect: () => {},
}))
vi.mock('../src/renderer/src/motion', () => ({ usePopoverPresence: () => ({ value: 'keyboard', props: {} }) }))
vi.mock('../src/renderer/src/useNotePopover', () => ({ useNotePopover: () => {} }))
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]
}
const attendees = [{ name: 'Attendee One', email: 'one@zeta.example' }, { name: 'Attendee Two', email: 'two@alpha.example' }, { name: 'Self', email: 'self@zeta.example' }]
const meeting = { id: 'note', attendees, startedAt: 1, ownEmail: 'self@zeta.example' } as Meeting
function setup(m: Meeting = meeting) {
  const renameAttendee = vi.fn().mockResolvedValue(true), setAttendees = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', { yogurt: { meetings: { renameAttendee, setAttendees } } })
  hooks.values = [false, 'Self']; hooks.index = 0
  const root = People({ m }) as any
  const element = root.props.children[1]
  hooks.values = []; hooks.index = 0
  const close = vi.fn()
  const render = () => { hooks.index = 0; return element.type({ ...element.props, onClose: close }) }
  return { render, renameAttendee, setAttendees, close }
}
afterEach(() => vi.unstubAllGlobals())
it('renames and removes the original attendee after company sorting, keeping self uneditable', async () => {
  const { render, renameAttendee, setAttendees } = setup()
  const rows = nodes(render()).filter(n => n.type?.name === 'Row')
  expect(rows.map(r => r.props.name)).toEqual(['Attendee Two', 'Self', 'Attendee One'])
  expect(rows[1].props.mine).toBe(true)
  expect(rows[1].props.onRemove).toBeUndefined()
  expect(rows[1].props.onRename).toBeUndefined()
  await rows[0].props.onRename('Updated attendee')
  expect(renameAttendee).toHaveBeenCalledWith('note', 1, 'Updated attendee', attendees[1])
  rows[0].props.onRemove()
  expect(setAttendees).toHaveBeenCalledWith('note', [attendees[0], attendees[2]])
})
it('retains keyboard entry for adding attendees and Escape dismissal', async () => {
  const { render, setAttendees, close } = setup()
  const byId = (id: string) => nodes(render()).find(n => n.props?.['data-testid'] === id)
  byId('people-add-open').props.onClick()
  byId('people-add').props.onChange({ target: { value: 'Additional attendee attendee@beta.example' } })
  byId('people-add').props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault: vi.fn() })
  await Promise.resolve(); await Promise.resolve()
  expect(setAttendees).toHaveBeenCalledWith('note', [...attendees, { name: 'Additional attendee', email: 'attendee@beta.example' }])
  expect(byId('people-add').props.value).toBe('')
  render().props.onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
  expect(close).toHaveBeenCalledOnce()
})
it('groups the self row by the saved event address, even with no attendee of the same name', () => {
  const m = { ...meeting, ownEmail: 'self@alpha.example', attendees: attendees.slice(0, 2) }
  const { render } = setup(m)
  const groups = nodes(render()).filter(n => n.type === 'section')
  const alpha = groups.find(g => g.props['aria-label'] === 'Alpha')
  const rows = nodes(alpha).filter(n => n.type?.name === 'Row')
  expect(rows.map(r => r.props.email)).toEqual(['self@alpha.example', 'two@alpha.example'])
  expect(rows[0].props.mine).toBe(true)
  expect(rows[0].props.onRename).toBeUndefined(); expect(rows[0].props.onRemove).toBeUndefined()
})
it('does not invent the self address from a matching name and retains another person with the same name', () => {
  const { render } = setup({ ...meeting, ownEmail: undefined })
  expect(nodes(render()).find(n => n.type?.name === 'Row' && n.props.mine).props.email).toBeNull()
  const other = setup({ ...meeting, ownEmail: 'mine@alpha.example' })
  expect(nodes(other.render()).filter(n => n.type?.name === 'Row' && n.props.name === 'Self')).toHaveLength(2)
})

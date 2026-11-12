import { describe, expect, it } from 'vitest'
import { draggedMeetings, emptySelection, meetingSelection, meetingTargets, selectsMeeting } from '../src/renderer/src/meetingSelection'
import { commandKey } from '../src/shared/platform'

const visible = ['a', 'b', 'c', 'd']
const first = meetingSelection(emptySelection, { type: 'select', id: 'b', visible })

describe('meeting selection', () => {
  it('selects from the menu without toggling an existing selection off', () => {
    expect(first).toEqual({ ids: ['b'], anchor: 'b' })
    expect(meetingSelection(first, { type: 'select', id: 'b', visible })).toEqual(first)
  })

  it('toggles and ends the mode when the last meeting is removed', () => {
    const two = meetingSelection(first, { type: 'toggle', id: 'c', visible })
    expect(two.ids).toEqual(['b', 'c'])
    expect(meetingSelection(two, { type: 'toggle', id: 'c', visible }).ids).toEqual(['b'])
    expect(meetingSelection(first, { type: 'toggle', id: 'b', visible })).toEqual(emptySelection)
  })

  it('adds inclusive ranges in either direction and preserves the anchor', () => {
    const down = meetingSelection(first, { type: 'range', id: 'd', visible })
    expect(down).toEqual({ ids: ['b', 'c', 'd'], anchor: 'b' })
    expect(meetingSelection(down, { type: 'range', id: 'a', visible })).toEqual({ ids: ['b', 'c', 'd', 'a'], anchor: 'b' })
    expect(meetingSelection(emptySelection, { type: 'range', id: 'c', visible }).ids).toEqual(['c'])
  })

  it('selects only the current list and clears without retaining a range anchor', () => {
    const all = meetingSelection(first, { type: 'all', visible: ['c', 'd'] })
    expect(all).toEqual({ ids: ['c', 'd'], anchor: 'c' })
    expect(meetingSelection(all, { type: 'clear' })).toEqual(emptySelection)
    expect(meetingSelection(all, { type: 'all', visible: [] })).toEqual(emptySelection)
  })

  it('drops unavailable rows and removes only successful deletes', () => {
    const all = meetingSelection(first, { type: 'all', visible })
    expect(meetingSelection(all, { type: 'remove', ids: ['a', 'c'] })).toEqual({ ids: ['b', 'd'], anchor: null })
    expect(meetingSelection(all, { type: 'prune', visible: ['a', 'b'] })).toEqual({ ids: ['a', 'b'], anchor: 'a' })
    expect(meetingSelection(first, { type: 'toggle', id: 'outside', visible })).toBe(first)
  })

  it('a plain click opens a meeting at rest and toggles it in selection mode', () => {
    expect(selectsMeeting(0, false, false)).toBe(false)
    expect(selectsMeeting(1, false, false)).toBe(true)
    expect(selectsMeeting(0, true, false)).toBe(true)
    expect(selectsMeeting(0, false, true)).toBe(true)
    const state = selectsMeeting(first.ids.length, false, false)
      ? meetingSelection(first, { type: 'toggle', id: 'c', visible }) : first
    expect(state.ids).toEqual(['b', 'c'])
    expect(commandKey({ metaKey: true, ctrlKey: false }, 'darwin')).toBe(true)
    for (const os of ['win32', 'linux']) expect(commandKey({ metaKey: false, ctrlKey: true }, os)).toBe(true)
  })

  it('menus and drags target the selection only when their row is selected', () => {
    expect(meetingTargets(['a', 'b'], 'a')).toEqual(['a', 'b'])
    expect(meetingTargets(['a', 'b'], 'c')).toEqual(['c'])
  })

  it('reads single and multi-meeting drags and rejects malformed selections', () => {
    expect(draggedMeetings('a')).toEqual(['a'])
    expect(draggedMeetings('["a","b","a"]')).toEqual(['a', 'b'])
    for (const payload of ['', '[]', '[', '["a",null]', '[""]']) expect(draggedMeetings(payload)).toEqual([])
  })
})

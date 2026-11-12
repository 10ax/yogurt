export type MeetingSelection = { ids: string[]; anchor: string | null }
export const emptySelection: MeetingSelection = { ids: [], anchor: null }
type Action = { type: 'toggle' | 'range' | 'select'; id: string; visible: string[] }
  | { type: 'all'; visible: string[] } | { type: 'prune'; visible: string[] } | { type: 'clear' } | { type: 'remove'; ids: string[] }

export function meetingSelection(state: MeetingSelection, action: Action): MeetingSelection {
  if (action.type === 'clear') return emptySelection
  if (action.type === 'all') return { ids: [...action.visible], anchor: action.visible[0] ?? null }
  if (action.type === 'prune' || action.type === 'remove') {
    const ids = state.ids.filter(id => action.type === 'prune' ? action.visible.includes(id) : !action.ids.includes(id))
    return ids.length === state.ids.length ? state : { ids, anchor: ids.includes(state.anchor ?? '') ? state.anchor : null }
  }
  if (!action.visible.includes(action.id)) return state
  const ids = new Set(state.ids)
  const at = action.visible.indexOf(state.anchor ?? '')
  if (action.type === 'range' && at >= 0) {
    const end = action.visible.indexOf(action.id)
    action.visible.slice(Math.min(at, end), Math.max(at, end) + 1).forEach(id => ids.add(id))
    return { ids: [...ids], anchor: state.anchor }
  }
  if (action.type === 'toggle' && ids.has(action.id)) ids.delete(action.id)
  else ids.add(action.id)
  return { ids: [...ids], anchor: ids.size ? action.id : null }
}

export const selectsMeeting = (selected: number, command: boolean, shift: boolean) => selected > 0 || command || shift
export const meetingTargets = (selected: string[], id: string) => selected.includes(id) ? selected : [id]

/** Single-row drags remain readable by the same drop target. */
export function draggedMeetings(value: string): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  try {
    const ids: unknown = JSON.parse(value)
    return Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.length > 0) ? [...new Set(ids)] : []
  } catch { return [] }
}

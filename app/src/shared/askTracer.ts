export const TRACER_LAP_MS = 1200
// The ⌘J panel finishes opening in 180ms; the flare starts a short beat after it settles.
export const TRACER_DELAY_MS = 300
export const TRACER_CADENCE_MS = 8000

export type TracerState = { focused: boolean; hovered: boolean; hasText: boolean; reduced: boolean; hidden: boolean }

/** One scheduler per panel opening; only the opening lap may ignore autofocus. */
export function createTracerSchedule(initial: TracerState, play: () => void, stop: () => void) {
  let state = initial, opening = true, disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const allowed = () => !state.hovered && !state.hasText && !state.reduced && !state.hidden && (opening || !state.focused)
  const cancel = () => { clearTimeout(timer); timer = undefined; stop() }
  const schedule = (delay: number) => {
    timer = setTimeout(() => {
      play()
      timer = setTimeout(() => {
        stop(); timer = undefined; opening = false
        if (allowed()) schedule(TRACER_CADENCE_MS - TRACER_LAP_MS)
      }, TRACER_LAP_MS)
    }, delay)
  }
  const update = (next: TracerState) => {
    if (disposed) return
    state = next
    if (!allowed()) { opening = false; cancel() }
    else if (timer === undefined) schedule(opening ? TRACER_DELAY_MS : TRACER_CADENCE_MS)
  }
  update(initial)
  return { update, dispose() { disposed = true; cancel() } }
}

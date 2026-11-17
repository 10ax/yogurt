const RETURN_MS = 900
const DOWN_PX = 24
const UP_PX = 8
const END_PX = 24

/** Only a person's scroll can hide the controls; callers reset before moving the list themselves. */
export function attachPlayerVisibility(list: HTMLElement, dock: HTMLElement) {
  let user = false, dragging = false, busy = false, hovered = false
  let last = list.scrollTop, direction = 0, distance = 0
  let hidden = false
  let idle: ReturnType<typeof setTimeout> | undefined
  const pinned = () => busy || hovered || dock.contains(document.activeElement) ||
    !list.clientHeight || list.scrollHeight - list.clientHeight - list.scrollTop <= END_PX
  const show = (hide: boolean) => {
    const next = hide && !pinned()
    // CSS retargets from the displayed position; repeated input leaves the transition alone.
    if (hidden === next) return
    hidden = next
    dock.dataset.hidden = String(hidden)
  }
  const reset = () => {
    user = false; direction = 0; distance = 0; last = list.scrollTop
    clearTimeout(idle); idle = undefined
    show(false)
  }
  const later = () => { clearTimeout(idle); idle = setTimeout(reset, RETURN_MS) }
  const arm = () => {
    // Passive input can arrive after the offset changes; keep the last scroll-event position.
    if (!user) { direction = 0; distance = 0 }
    user = true; later()
  }
  const scroll = () => {
    const delta = list.scrollTop - last
    last = list.scrollTop
    if (pinned()) { reset(); return }
    if (!user || !delta) return
    const sign = Math.sign(delta)
    distance = sign === direction ? distance + Math.abs(delta) : Math.abs(delta)
    direction = sign
    if (sign > 0 && distance >= DOWN_PX) show(true)
    if (sign < 0 && distance >= UP_PX) show(false)
    later()
  }
  const wheel = (event: WheelEvent) => {
    if (event.isTrusted && !event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) arm()
  }
  const key = (event: KeyboardEvent) => {
    if (event.isTrusted && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey &&
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) &&
      !(event.target as HTMLElement).closest('input, textarea, button, [contenteditable="true"]')) arm()
  }
  const touch = (event: TouchEvent) => { if (event.isTrusted) arm() }
  const down = (event: PointerEvent) => {
    if (!event.isTrusted || event.button !== 0 || event.target !== list) return
    const box = list.getBoundingClientRect(), x = event.clientX - box.left
    // Only the scrollbar gutter, including an overlay scrollbar, starts a drag gesture.
    if (x <= Math.max(list.clientLeft, 12) || x >= Math.min(list.clientLeft + list.clientWidth, box.width - 12)) {
      dragging = true; arm()
    }
  }
  const move = (event: PointerEvent) => { if (dragging && event.isTrusted) arm() }
  const up = () => { dragging = false }
  const enter = (event: PointerEvent) => { if (event.pointerType !== 'touch') { hovered = true; reset() } }
  const leave = () => { hovered = false }
  const resize = () => { if (pinned()) reset() }
  const observer = new ResizeObserver(resize)
  observer.observe(list)
  // Text wrapping and filtering can change scrollability without resizing the list itself.
  const content = new MutationObserver(resize)
  content.observe(list, { childList: true, subtree: true })
  list.addEventListener('scroll', scroll, { passive: true })
  list.addEventListener('wheel', wheel, { passive: true })
  list.addEventListener('touchmove', touch, { passive: true })
  list.addEventListener('keydown', key)
  list.addEventListener('pointerdown', down)
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerup', up)
  document.addEventListener('pointercancel', up)
  dock.addEventListener('pointerenter', enter)
  dock.addEventListener('pointerleave', leave)
  dock.addEventListener('focusin', reset)
  dock.dataset.hidden = 'false'
  return {
    programmatic: reset,
    pin(value: boolean) { busy = value; reset() },
    dispose() {
      clearTimeout(idle)
      observer.disconnect(); content.disconnect()
      list.removeEventListener('scroll', scroll)
      list.removeEventListener('wheel', wheel)
      list.removeEventListener('touchmove', touch)
      list.removeEventListener('keydown', key)
      list.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      dock.removeEventListener('pointerenter', enter)
      dock.removeEventListener('pointerleave', leave)
      dock.removeEventListener('focusin', reset)
      delete dock.dataset.hidden
    },
  }
}

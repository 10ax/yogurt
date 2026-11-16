export function mentionPosition(line: { left: number; top: number; bottom: number }, menu: { width: number; height: number }, viewport: { width: number; height: number }) {
  const padding = 16, gap = 4
  const below = Math.max(0, viewport.height - padding - line.bottom - gap)
  const above = Math.max(0, line.top - gap - padding)
  const flip = menu.height > below && above > below
  const maxHeight = Math.min(menu.height, flip ? above : below)
  return {
    left: Math.max(padding, Math.min(line.left, viewport.width - padding - menu.width)),
    top: Math.max(padding, Math.min(flip ? line.top - gap - maxHeight : line.bottom + gap, viewport.height - padding - maxHeight)),
    maxHeight,
  }
}

export function textareaMentionRect(input: HTMLTextAreaElement, start: number) {
  const style = getComputedStyle(input), bounds = input.getBoundingClientRect()
  const mirror = document.createElement('div'), marker = document.createElement('span')
  for (const property of [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch',
    'line-height', 'letter-spacing', 'word-spacing', 'text-indent', 'text-align', 'text-transform',
    'direction', 'tab-size', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-style',
    'white-space', 'overflow-wrap', 'word-break',
  ]) mirror.style.setProperty(property, style.getPropertyValue(property))
  // clientWidth excludes the textarea's scrollbar, so wrapping stays aligned when it scrolls.
  Object.assign(mirror.style, {
    position: 'fixed', visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0',
    boxSizing: 'border-box', width: `${input.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`,
  })
  mirror.setAttribute('aria-hidden', 'true')
  mirror.textContent = input.value.slice(0, start)
  marker.textContent = input.value.slice(start, start + 1)
  mirror.append(marker, document.createTextNode(input.value.slice(start + 1)))
  document.body.append(mirror)
  try {
    const rect = marker.getBoundingClientRect()
    const height = parseFloat(style.lineHeight)
    const top = bounds.top + rect.top - (height - rect.height) / 2 - input.scrollTop
    return { left: bounds.left + rect.left - input.scrollLeft, top, bottom: top + height }
  } finally { mirror.remove() }
}

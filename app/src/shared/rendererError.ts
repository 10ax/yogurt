export type RendererError = { message: string; stack: string; componentStack: string }

// Error messages can contain document text (JSON parsing and rejected IPC calls in particular).
// Keep known runtime diagnostics; never serialize an arbitrary thrown value or its custom fields.
const kinds = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'IndexSizeError', 'InvalidStateError', 'NotFoundError', 'NotSupportedError', 'SecurityError', 'AbortError', 'QuotaExceededError']
function message(value: unknown, kind: unknown): string {
  const omitted = `${typeof kind === 'string' && kinds.includes(kind) ? kind : 'Renderer error'} (message omitted for privacy)`
  if (typeof value !== 'string') return omitted
  const text = value.slice(0, 2000)
  for (const fixed of [
    'Renderer recovery test', 'Maximum update depth exceeded', 'Too many re-renders',
    'Rendered more hooks than during the previous render', 'Rendered fewer hooks than expected',
    'Invalid hook call', 'Maximum call stack size exceeded',
    'ResizeObserver loop completed with undelivered notifications', 'ResizeObserver loop limit exceeded',
    'Cannot convert undefined or null to object',
  ]) if (text === fixed || text.startsWith(`${fixed}.`)) return fixed
  const react = /^Minified React error #(\d+);/.exec(text)
  if (react) return `Minified React error #${react[1]};`
  const read = /^Cannot read properties of (undefined|null)/.exec(text)
  if (read) return `Cannot read properties of ${read[1]}`
  const dom = /^Failed to execute '(setStart|setEnd|observe|scrollTo)' on '(Range|ResizeObserver|MutationObserver|Element)':/.exec(text)
  if (dom) return `${dom[0]} operation failed`
  for (const suffix of ['is not a function', 'is not defined', 'is not iterable']) {
    if (text.endsWith(suffix)) return `A value ${suffix}`
  }
  if (['Renderer error', ...kinds].some(name => text === `${name} (message omitted for privacy)`)) return text
  return omitted
}

/** Code locations only: no exception headline, absolute user paths, URL queries or source excerpts. */
function frames(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.slice(0, 64_000).split('\n').flatMap(line => {
    const frame = /^\s*at (?:([\w.$<>]+) \()?[^\s?]*?([\w.-]+\.[cm]?[jt]sx?):(\d+):(\d+)\)?$/.exec(line)
    return frame ? [`    at ${frame[1] ? `${frame[1]} (` : ''}${frame[2]}:${frame[3]}:${frame[4]}${frame[1] ? ')' : ''}`] : []
  }).slice(0, 40).join('\n').slice(0, 8000)
}

export function rendererError(error: unknown, componentStack?: string | null): RendererError {
  try {
    const e = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
    return { message: message(e?.message ?? error, e?.name), stack: frames(e?.stack), componentStack: frames(componentStack ?? e?.componentStack) }
  } catch { return { message: 'Renderer error (message omitted for privacy)', stack: '', componentStack: '' } }
}

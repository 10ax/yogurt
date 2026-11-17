import { rendererError } from '../../shared/rendererError'

export function reportRendererError(error: unknown, componentStack?: string | null) {
  try {
    // A rejected data object can have fields named message or stack; it is not an exception.
    if (error && typeof error === 'object' && !(error instanceof Error) &&
      !(typeof DOMException !== 'undefined' && error instanceof DOMException)) error = undefined
    window.yogurt.reportRendererError(rendererError(error, componentStack ?? ''))
  }
  catch { /* Reporting must not cause another renderer failure. */ }
}

export function installRendererErrors() {
  const error = (event: ErrorEvent) => reportRendererError(event.error ?? event.message)
  const rejection = (event: PromiseRejectionEvent) => reportRendererError(event.reason)
  window.addEventListener('error', error)
  window.addEventListener('unhandledrejection', rejection)
  return () => { window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection) }
}

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../../../shared/i18n'
import { useLanguage } from '../i18n'
import { handoffOpenNotes } from '../noteAutosave'
import { reportRendererError } from '../rendererErrors'

export class RendererGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown, info: ErrorInfo) { reportRendererError(error, info.componentStack) }
  render() { return this.state.failed ? <RendererRecovery /> : this.props.children }
}

export function RendererRecovery() {
  useLanguage()
  const [saveFailed, setSaveFailed] = useState(false)
  return <main className="renderer-recovery" data-testid="renderer-recovery">
    <div className="renderer-recovery-titlebar drag" aria-hidden="true" />
    <div className="renderer-recovery-content">
      <p role="alert">{saveFailed ? t("Yogurt couldn't finish saving") : t("This window couldn't be displayed.")}</p>
      <button autoFocus type="button" className="modal-button primary" onClick={() => {
        // Reload only after main has saved or retained every pending edit.
        if (handoffOpenNotes()) window.location.reload()
        else setSaveFailed(true)
      }}>{t('Reload')}</button>
    </div>
  </main>
}

/** Fake mode exercises a real descendant render failure, including editor cleanup. */
export function RendererFailureTest({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!window.yogurt.fake) return
    const fail = () => setFailed(true)
    window.addEventListener('yogurt:renderer-fail', fail)
    return () => window.removeEventListener('yogurt:renderer-fail', fail)
  }, [])
  if (failed) throw new Error('Renderer recovery test')
  return children
}

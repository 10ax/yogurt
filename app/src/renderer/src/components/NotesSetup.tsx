import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { SetupState } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { notesPercent, notesReadyNotice } from '../notesSetup'
import { NotesModelWait } from './NotesModelWait'
import { toasts } from './TrashToast'

export function NotesSetup({ collapsed = false }: { collapsed?: boolean }) {
  const [setup, setSetup] = useState<SetupState>()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDialogElement>(null)
  const notice = useRef<ReturnType<typeof notesReadyNotice>>(undefined)
  notice.current ??= notesReadyNotice()
  const waiting = !!setup && (setup.notesDownloading || !!setup.notesError)
  useEffect(() => {
    let current: SetupState | undefined, active = true
    const update = (state: SetupState) => {
      current = state; setSetup(state)
      if (notice.current!(state, document.visibilityState === 'visible', Date.now())) {
        toasts.add({ title: t("Yogurt's AI is ready. Summaries and Ask now work."), data: { testId: 'notes-ready-toast' } })
      }
      if (!state.notesDownloading && !state.notesError) setOpen(false)
    }
    const off = window.yogurt.setup.onState(update)
    void window.yogurt.setup.state().then(state => { if (active && !current) update(state) })
    const visibility = () => { if (current) update(current) }
    document.addEventListener('visibilitychange', visibility)
    return () => { active = false; off(); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  const close = useCallback(() => { panel.current?.close(); setOpen(false); trigger.current?.focus({ preventScroll: true }) }, [])
  useLayoutEffect(() => {
    const el = panel.current
    if (!open || !el || !waiting) return
    el.show()
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const start = getComputedStyle(el).direction === 'rtl' ? innerWidth - rect.right : rect.x
      el.style.insetInlineStart = `${Math.max(12, Math.min(start, innerWidth - el.getBoundingClientRect().width - 12))}px`
      el.style.bottom = `${Math.max(64, innerHeight - rect.y + 8)}px`
    }
    position()
    el.querySelector<HTMLButtonElement>('button')?.focus()
    const away = (e: PointerEvent) => { if (!el.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }
    window.addEventListener('resize', position); document.addEventListener('pointerdown', away); document.addEventListener('keydown', key)
    return () => { el.close(); window.removeEventListener('resize', position); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [open, waiting, collapsed, close])
  if (!waiting) return null
  const percent = notesPercent(setup.notesFraction ?? 0)
  const label = setup.notesError ? t('Setting up notes') : t('Setting up notes · {percent}', { percent })
  return <>
    <button ref={trigger} data-testid="notes-setup-open" data-sidebar="menu-button" className="setup-checklist-trigger workspace-nav" aria-label={label} title={collapsed ? label : undefined}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <svg className="setup-progress" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2.5" className="setup-progress-track" /><circle cx="8" cy="8" r="5.5" pathLength="100" stroke="currentColor" strokeWidth="2.5" strokeDasharray="100" strokeDashoffset={100 - (setup.notesFraction ?? 0) * 100} strokeLinecap="round" /></svg>
      <span>{label}</span>
    </button>
    {open && createPortal(<dialog ref={panel} data-testid="notes-setup" aria-label={t('Setting up notes')} className="finish-setup" onCancel={e => { e.preventDefault(); close() }}>
      <div className="finish-setup-header"><h2>{t('Setting up notes')}</h2><button aria-label={t('Close')} className="finish-setup-close no-drag" onClick={close}><X size={14} aria-hidden="true" /></button></div>
      <div className="p-3 text-sm text-muted"><NotesModelWait><p>{t("Recording works now. Summaries and Ask start when Yogurt's AI finishes downloading.")}</p></NotesModelWait></div>
    </dialog>, document.body)}
  </>
}

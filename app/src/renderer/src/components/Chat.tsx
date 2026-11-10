import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { LibrarySource } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { keys, onMac } from '../keys'
import { MessageCircle } from './Icons'
import { setToastDialog } from './TrashToast'
import { AskConversation } from './AskConversation'
import { rememberScrollPositions } from '../useScrollMemory'

/** The existing panel shell; its conversation and composer are shared with the Ask page. */
export function Ask({ id, recording, anchor, onSource }: { id: string; recording: boolean; anchor: HTMLElement | null; onSource: (s: LibrarySource, match?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const [error, setError] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 999px)').matches)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDialogElement>(null)
  const motion = useRef<Animation[]>([])
  const animateOpen = useRef(false)
  const closing = useRef(false)
  useEffect(() => { setOpen(false); setConversationId(undefined); setError(false); closing.current = false }, [id])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 999px)')
    const change = () => setNarrow(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!open || conversationId) return
    let active = true
    void window.yogurt.conversations.current([{ kind: 'meeting', id }]).then(cid => { if (active) setConversationId(cid) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [open, id, conversationId])
  const fade = (expand: boolean, animate: boolean) => {
    const dialog = panel.current
    if (!dialog) return
    const running = motion.current.some(animation => animation.playState === 'running')
    const opacity = getComputedStyle(dialog).opacity
    motion.current.forEach(animation => animation.cancel()); motion.current = []
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = dialog.animate([{ opacity: running ? opacity : expand ? 0 : 1 }, { opacity: expand ? 1 : 0 }], { duration: 160, easing: 'ease-out', fill: 'both' })
    motion.current = [animation]
    return animation
  }
  useEffect(() => () => motion.current.forEach((animation) => animation.cancel()), [])
  useLayoutEffect(() => {
    if (!open || !anchor || !panel.current) return
    const dialog = panel.current
    const position = () => {
      const bounds = anchor.getBoundingClientRect()
      dialog.style.setProperty('--chat-bottom', `${Math.max(16, innerHeight - bounds.bottom + 12)}px`)
      // Reminders and download notices must not push Ask over the recording controls.
      dialog.style.setProperty('--chat-height', `${narrow ? 440 : Math.max(0, bounds.height - 24)}px`)
    }
    position()
    // Native modal behavior makes the covered note inert at narrow widths; desktop stays editable.
    if (narrow) dialog.showModal(); else dialog.show()
    setToastDialog(narrow ? dialog : null)
    fade(true, animateOpen.current)
    animateOpen.current = false
    panel.current?.querySelector('textarea')?.focus({ preventScroll: true })
    const observer = new ResizeObserver(position)
    observer.observe(anchor)
    window.addEventListener('resize', position)
    return () => { observer.disconnect(); window.removeEventListener('resize', position); setToastDialog(null); dialog.close() }
  }, [open, narrow, anchor])
  const close = (animate = true) => {
    if (closing.current) return
    closing.current = true
    const animation = fade(false, animate)
    const done = () => {
      if (!closing.current) return
      closing.current = false
      panel.current?.close(); setOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    if (animation) void animation.finished.then(done, () => {})
    else done()
  }

  const conversation = open && <dialog id="meeting-chat" ref={panel} data-testid="chat-panel" className="chat-panel no-drag"
    aria-labelledby="meeting-chat-title" aria-modal={narrow || undefined}
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented && !panel.current?.querySelector('.citation-card:not([data-ending-style])') && !(event.target as HTMLElement).closest('[role="alertdialog"], [role="dialog"], [role="menu"]')) { event.preventDefault(); event.stopPropagation(); close(false) } }}
    onCancel={event => { event.preventDefault(); close(false) }}>
    <div className="chat-panel-contents">
      {!conversationId && <header className="ask-conversation-head"><h2 id="meeting-chat-title">{t('New chat')}</h2>
        <button data-testid="chat-close" className="chat-icon" onClick={() => close()} aria-label={t('Close')}><X size={16} aria-hidden="true" /></button>
      </header>}
      {error && <p role="alert">{t("Yogurt couldn't answer that.")}</p>}
      {conversationId && <AskConversation key={conversationId} id={conversationId} panel recording={recording} onSelect={setConversationId} onClose={() => close()}
        onExpand={() => { rememberScrollPositions(); close(false); window.yogurt.nav.go(`/chat/${conversationId}`) }}
        onDeleted={() => { close(false); setConversationId(undefined); window.yogurt.nav.go('/chat') }}
        onSource={(source, match) => { close(false); onSource(source, match) }} />}
    </div>
  </dialog>
  return <>
    <button id="meeting-ask" ref={trigger} data-testid="chat-open" className="chat-trigger" type="button" aria-expanded={open} aria-controls="meeting-chat"
      title={onMac() ? t('Ask Yogurt (⌘J)') : `${t('Ask Yogurt')} (${keys('⌘J')})`} onClick={event => {
        if (closing.current) { closing.current = false; fade(true, event.detail > 0) }
        animateOpen.current = event.detail > 0; setError(false); setOpen(true)
        panel.current?.querySelector('textarea')?.focus({ preventScroll: true })
      }}><MessageCircle size={16} strokeWidth={1.75} aria-hidden="true" /><span>{t('Ask Yogurt')}</span><kbd aria-hidden="true">{keys('⌘J')}</kbd></button>
    {anchor && createPortal(conversation, anchor)}
  </>
}

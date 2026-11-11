import { SPEAKER_COLORS } from '../../../shared/speakerColors'
import { widgetDragDelta, isWidgetClick, type WidgetPress } from '../../../shared/widgetGesture'
import { Loading } from '../components/Loading'
import { bubbles, turns, withLive } from '../../../shared/transcript'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, MicOff, RotateCw, TriangleAlert } from 'lucide-react'
import type { Segment, TranscriptPartial, WidgetView } from '../../../shared/types'
import { formatElapsed } from '../../../shared/wave'
import { t } from '../../../shared/i18n'
import { Logo } from '../components/Logo'
import { LevelBars } from '../components/LevelBars'
import { LiveWords } from '../components/Transcript'
import { glide } from '../motion'
import { afterFinal, joinWords } from '../../../shared/liveWords'
import { Swap } from '../components/Swap'

function useElapsed(v: WidgetView | null): string {
  const [text, setText] = useState('0:00')
  useEffect(() => {
    if (!v) return
    const tick = () => setText(formatElapsed(v.kind === 'recording' && !v.paused ? v.elapsedMs + (Date.now() - v.at) : v.elapsedMs))
    tick()
    if (v.kind !== 'recording' || v.paused) return
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [v])
  return text
}

/** The live transcript opens once the pointer settles on the recorder, never on the way to grabbing it, and not
 * straight after a drag: it waits for the pointer to rest there a moment longer. */
const SETTLE_MS = 220, AFTER_DRAG_MS = 650
function useHoverPreview() {
  const over = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined), quietUntil = useRef(0)
  const wait = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (over.current) window.yogurt.widget.preview(true) }, Math.max(SETTLE_MS, quietUntil.current - performance.now()))
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    enter: () => { over.current = true; wait() },
    // still moving across it, or about to press: keep waiting
    move: (pressed: boolean) => { if (over.current && !pressed) wait() },
    press: () => clearTimeout(timer.current),
    leave: () => { over.current = false; clearTimeout(timer.current); window.yogurt.widget.preview(false) },
    dropped: () => { quietUntil.current = performance.now() + AFTER_DRAG_MS; wait() },
  }
}

/** A click opens the note; a drag moves the recorder without opening it on release. */
function useDragOrClick(onClick: () => void, hover: ReturnType<typeof useHoverPreview>) {
  const s = useRef<WidgetPress | null>(null)
  const cancel = () => {
    if (s.current?.moved) window.yogurt.widget.endDrag()
    s.current = null
  }
  useEffect(() => () => { if (s.current?.moved) window.yogurt.widget.endDrag() }, [])
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || s.current || (e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      hover.press()
      e.currentTarget.setPointerCapture(e.pointerId)
      s.current = { x: e.screenX, y: e.screenY, pointerId: e.pointerId, at: e.timeStamp, moved: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = s.current
      hover.move(!!d)
      if (!d || e.pointerId !== d.pointerId) return
      const delta = widgetDragDelta(d, e.screenX, e.screenY)
      if (delta) window.yogurt.widget.drag(delta.dx, delta.dy)
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = s.current
      if (!d || e.pointerId !== d.pointerId) return
      const click = isWidgetClick(d, e.screenX, e.screenY, e.timeStamp)
      cancel()
      e.currentTarget.releasePointerCapture(e.pointerId)
      if (click) onClick()
      else if (d.moved) hover.dropped()
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('button') || !['Enter', ' '].includes(e.key)) return
      e.preventDefault()
      if (!e.repeat) onClick()
    },
  }
}

function useWidgetView() {
  const [view, setView] = useState<WidgetView | null>(null)
  useEffect(() => {
    document.documentElement.classList.add('widget')
    void window.yogurt.widget.state().then(setView)
    return window.yogurt.widget.onState(setView)
  }, [])
  return view
}

function useSize(card: React.RefObject<HTMLDivElement | null>, shape: string) {
  useEffect(() => {
    const el = card.current
    if (!el) return
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); window.yogurt.widget.size(Math.ceil(r.width), Math.ceil(r.height)) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [shape])
}

/**
 * The recording-only strip: mark, one wave and time. A click opens the note's controls.
 * A separate card shows warnings and hovered live words without moving the recorder.
 */
export function Widget() {
  const view = useWidgetView()
  const card = useRef<HTMLDivElement>(null)
  const recording = view?.kind === 'recording' && !view.paused
  useSize(card, recording ? 'recording' : 'none')

  if (!recording) return null
  return (
    <div className="flex h-full items-start">
      <Recording view={view} cardRef={card} />
    </div>
  )
}

function Recording({ view, cardRef }: { view: WidgetView; cardRef: React.RefObject<HTMLDivElement | null> }) {
  const time = useElapsed(view)
  const hover = useHoverPreview()
  const press = useDragOrClick(() => window.yogurt.widget.open(), hover)
  const note = view.note
  return (
      <div ref={cardRef} data-testid="widget" data-kind="recording" role="button" tabIndex={0} className="widget-pill widget-strip grid h-[42px] w-max min-w-[127px] shrink-0 cursor-pointer select-none items-center gap-3 rounded-[10px] px-3 text-[var(--pill-ink)]"
        {...press} onPointerEnter={hover.enter} onPointerLeave={hover.leave}
        aria-label={t('Open {title}', { title: view.title })} title={note?.text ?? t('Recording {title}', { title: view.title })}>
        <Swap show={note ? 'warning' : 'logo'} className="text-[var(--pill-accent)]" options={{ logo: <Logo size={18} />, warning: <TriangleAlert data-testid="widget-warning" size={18} /> }} />
        <LevelBars testId="widget-wave" height={16} className="justify-self-center text-[var(--pill-accent)]" />
        <span data-testid="widget-time" className="min-w-[32px] shrink-0 whitespace-nowrap text-end text-[10px] font-medium tabular-nums opacity-80">
          {time}
        </span>
      </div>
    )
}

/** Separate, tightly fitted native window: showing words never moves the recorder itself. */
export function WidgetPreview() {
  const view = useWidgetView()
  const card = useRef<HTMLDivElement>(null)
  const recording = view?.kind === 'recording' && !view.paused
  useSize(card, recording ? 'recording' : 'none')
  return recording ? <Preview key={view.meetingId} view={view} cardRef={card} /> : null
}

function Preview({ view, cardRef }: { view: WidgetView; cardRef: React.RefObject<HTMLDivElement | null> }) {
  const [lines, setLines] = useState<Array<Omit<Segment, 'id'>>>([])
  const [parts, setParts] = useState<Record<string, TranscriptPartial>>({})
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const gliding = useRef<(() => void) | null>(null)
  const [behind, setBehind] = useState(false)
  useEffect(() => {
    let alive = true
    const refresh = () => { void window.yogurt.transcript.get(view.meetingId, { hidden: true }).then((saved) => {
      if (!alive) return
      // A hover shows recent context; the full transcript stays in the meeting.
      const recent = saved.slice(-80)
      const known = new Map(saved.map(s => [`${s.track}:${s.startMs}`, s]))
      setLines(current => {
        const merged = new Map(current.map(s => [`${s.track}:${s.startMs}`, known.get(`${s.track}:${s.startMs}`) ?? s]))
        for (const s of recent) merged.set(`${s.track}:${s.startMs}`, s)
        return [...merged.values()].filter(s => !s.hidden).sort((a, b) => a.startMs - b.startMs)
      })
      setLoaded(true); setFailed(false)
    }, () => { if (alive) { setLoaded(true); setFailed(true) } }) }
    const offSegment = window.yogurt.transcript.onSegment((s) => {
      if (s.meetingId !== view.meetingId) return
      setLines(current => [...current.filter(l => l.track !== s.track || l.startMs !== s.startMs), s].filter(l => !l.hidden).sort((a, b) => a.startMs - b.startMs))
      setParts(current => {
        const had = current[s.track]
        if (!had) return current
        const words = afterFinal(had.words ?? [], { endMs: s.endMs, text: s.text })
        const next = { ...current }
        if (words.length) next[s.track] = { ...had, words, text: joinWords(words), startMs: words[0].startMs }; else delete next[s.track]
        return next
      })
    })
    const offPartial = window.yogurt.transcript.onPartial(p => {
      if (p.meetingId !== view.meetingId) return
      setParts(current => { const next = { ...current }; if (p.text) next[p.track] = p; else delete next[p.track]; return next })
    })
    const offNames = window.yogurt.transcript.onSpeakers(id => { if (id === view.meetingId) refresh() })
    refresh()
    return () => { alive = false; offSegment(); offPartial(); offNames() }
  }, [view.meetingId])
  const grouped = useMemo(() => turns(withLive(lines, Object.values(parts).map(p => ({
    ...p, words: p.words ?? [], endMs: p.words?.at(-1)?.endMs ?? p.startMs,
  })))), [lines, parts])
  useLayoutEffect(() => {
    if (stick.current && !gliding.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [grouped, loaded])
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (stick.current && !gliding.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
    })
    if (content.current) observer.observe(content.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    // screen.availHeight is independent of this window's measured height, so it can grow again after shrinking.
    const fit = () => card.style.setProperty('--preview-max-height', `${Math.min(520, window.screen.availHeight)}px`)
    const appear = () => {
      if (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) card.animate([{opacity:0},{opacity:1}],{duration:120,easing:'ease-out'})
    }
    fit(); appear()
    window.addEventListener('resize', fit)
    document.addEventListener('visibilitychange', appear)
    return () => { window.removeEventListener('resize', fit); document.removeEventListener('visibilitychange', appear); gliding.current?.() }
  }, [cardRef])
  const manual = () => { gliding.current?.(); gliding.current = null; stick.current = false }
  const latest = () => {
    const el = scroll.current
    if (!el) return
    gliding.current?.()
    stick.current = true; setBehind(false)
    gliding.current = glide(el, el.scrollHeight - el.clientHeight, () => {
      requestAnimationFrame(() => {
        gliding.current = null
        if (stick.current) el.scrollTop = el.scrollHeight
      })
    })
  }
  const note = view.note
  return <div ref={cardRef} data-testid="widget-preview" className="widget-preview" role="region" aria-label={t('Live transcript')}
    onPointerEnter={() => window.yogurt.widget.preview(true)} onPointerLeave={() => window.yogurt.widget.preview(false)}>
    {note && <p data-testid="widget-note" data-tone={note.tone} className="widget-preview-warning" role="status">
      {note.tone === 'hiccup' ? <RotateCw size={13} aria-hidden="true" /> : note.code === 'no-mic' ? <MicOff size={13} aria-hidden="true" /> : <TriangleAlert size={13} aria-hidden="true" />}
      <span>{note.text}</span>
    </p>}
    <div ref={scroll} data-testid="widget-preview-text" className="widget-preview-conversation" role="log" aria-live="off" aria-label={t('Transcript')}
      onWheel={manual} onTouchStart={manual} onPointerDown={manual} onKeyDown={manual} onScroll={e => {
      if (gliding.current) return
      const el = e.currentTarget
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      setBehind(!stick.current)
    }}>
      <div ref={content}>
      {!loaded ? <Loading layout="transcript" testId="widget-preview-loading" /> : !grouped.length && <p className="widget-preview-empty">{failed ? t("Couldn't load the transcript. Open Yogurt to try again.") : t('Listening for speech…')}</p>}
      {grouped.map(turn => {
        const first = turn[0], me = first.track === 'me'
        const who = me ? t('You') : first.speaker || t('Them')
        const color = me || !('speakerColor' in first) ? undefined : first.speakerColor
        return <div key={`${first.track}:${first.startMs}`} className="widget-preview-turn" data-me={me}>
          <span className="widget-preview-speaker" data-color={color} data-folder-color={color === undefined ? undefined : SPEAKER_COLORS[color]}>{who}</span>
          {bubbles(turn).map(group => <p key={`${group[0].track}:${group[0].startMs}`} data-testid="widget-preview-bubble" className="widget-preview-bubble" dir="auto">
            {group.map((line, i) => <Fragment key={`${line.track}:${line.startMs}`}>{i > 0 && ' '}{'live' in line ? <LiveWords said={line.live} /> : line.text}</Fragment>)}
          </p>)}
        </div>
      })}
      </div>
    </div>
    {behind && <button data-testid="widget-preview-latest" className="widget-preview-latest" onClick={latest}><ArrowDown size={12} aria-hidden="true" />{t('Latest')}</button>}
  </div>
}

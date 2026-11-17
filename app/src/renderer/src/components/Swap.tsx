import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Icons that change in place: every option shares one grid cell, so nothing around it moves, and only the current
 * one shows. The one leaving shrinks, softens and fades while the next grows in (scaled on the wrapper, never the
 * svg, so the icon stays crisp).
 */
export function Swap<K extends string>({ show, options, className }: { show: K; options: Record<K, ReactNode>; className?: string }) {
  return <span className={`swap ${className ?? ''}`} aria-hidden="true">
    {(Object.keys(options) as K[]).map(key => <span key={key} data-on={key === show}>{options[key]}</span>)}
  </span>
}

/** `widest` reserves a fixed label width; without it, fit the current words and ease between widths. */
export function SwapText({ text, widest }: { text: string; widest?: string }) {
  const mounted = useRef(false), label = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState<number>()
  useEffect(() => { mounted.current = true }, [])
  useLayoutEffect(() => {
    const el = label.current
    if (widest != null || !el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, widest])
  return <span className="swap-text" data-widest={widest} data-resize={widest == null || undefined} style={widest == null && width != null ? { width } : undefined}>
    <span ref={label} key={text} className={mounted.current ? 'swap-in' : undefined}>{text}</span>
  </span>
}

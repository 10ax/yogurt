import { useEffect, useRef } from 'react'
import { barPlan, micLevel, Wave } from '../../../shared/wave'

const BAR_W = 3, GAP = 3

const reducedQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)')

/** Shared live microphone meter, drawn without React renders; no simulated movement. */
export function LevelBars({ height, className, testId, paused = false, bars = 5 }: { height: number; bars?: 3 | 5; className?: string; testId: string; paused?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const width = bars * BAR_W + (bars - 1) * GAP
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const wave = new Wave()
    const mq = reducedQuery()
    const dpr = window.devicePixelRatio || 1
    let reduced = mq.matches
    c.width = width * dpr; c.height = height * dpr
    const draw = () => {
      const ctx = c.getContext('2d')
      if (!ctx) return
      const plan = barPlan({ reduced, paused, level: wave.level, bars })
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = getComputedStyle(c).color
      plan.heights.forEach((v, i) => {
        const h = BAR_W + Math.round(v * (height - BAR_W))
        ctx.globalAlpha = plan.alpha[i]
        ctx.beginPath()
        const inset = (width - plan.heights.length * BAR_W - (plan.heights.length - 1) * GAP) / 2
        ctx.roundRect(inset + i * (BAR_W + GAP), (height - h) / 2, BAR_W, h, BAR_W / 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1
      c.dataset.level = wave.level.toFixed(2)
    }
    let levelAt = performance.now()
    const off = window.yogurt.widget.onLevel((lv) => {
      wave.target = micLevel(lv); levelAt = performance.now()
      if (reduced) { wave.level = wave.target; draw() }
    })
    let raf = 0, last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(100, now - last); last = now
      if (now - levelAt > 300) wave.target = 0
      wave.step(dt)
      draw()
      raf = requestAnimationFrame(frame)
    }
    // the loop runs only without reduced motion; either way something is drawn right away
    const sync = () => {
      cancelAnimationFrame(raf); raf = 0
      if (!reduced && !paused) { last = performance.now(); raf = requestAnimationFrame(frame) }
      draw()
    }
    const onReduced = () => { reduced = mq.matches; sync() }
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onReduced)
    scheme.addEventListener('change', draw)
    sync()
    return () => { off(); cancelAnimationFrame(raf); mq.removeEventListener('change', onReduced); scheme.removeEventListener('change', draw) }
  }, [height, width, paused, bars])
  return <canvas ref={canvas} data-testid={testId} aria-hidden="true" className={className} style={{ width, height }} />
}

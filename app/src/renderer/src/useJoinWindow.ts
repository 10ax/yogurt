import { useEffect, useState } from 'react'
import { canJoinEvent, JOIN_EARLY_MS } from '../../shared/comingUp'

/** Recheck at the two join boundaries and when waking, without polling an open card. */
export function useJoinWindow(start: number, end: number | null | undefined): boolean {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      const at = Date.now()
      setNow(at)
      const next = at < start - JOIN_EARLY_MS ? start - JOIN_EARLY_MS : end != null && at < end ? end : undefined
      if (next !== undefined) timer = setTimeout(update, Math.min(next - at, 2_147_483_647))
    }
    update()
    window.addEventListener('focus', update)
    return () => { clearTimeout(timer); window.removeEventListener('focus', update) }
  }, [start, end])
  return canJoinEvent(start, end, now)
}

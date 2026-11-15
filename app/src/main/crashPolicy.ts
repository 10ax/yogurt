/**
 * What to do when the audio helper dies mid-meeting: start it again, as the next part of the same meeting's files
 * (picking up at the meeting time where the last audio ended; the parts are joined into one file per track when
 * the meeting stops). A long meeting can see a few unrelated crashes hours apart (a 2.5 h meeting stopped after its
 * second), so only a crash loop gives up: a third crash within two minutes stops the meeting with the notes and audio
 * so far kept. One policy per meeting.
 */
export type CrashDeps = {
  /** starts a new helper for the next part, in the same meeting folder; may throw */
  restart(): void
  /** tell the person recording hiccuped but goes on */
  hiccup(): void
  /** tell the person recording stopped, and stop the meeting */
  giveUp(): void
  now?: () => number
}

const LOOP_MS = 2 * 60_000
const LOOP_RESTARTS = 2

export function createCrashPolicy(d: CrashDeps) {
  const now = d.now ?? Date.now
  let restarts: number[] = []
  return {
    ended(e: { crashed: boolean }): 'done' | 'restarted' | 'stopped' {
      if (!e.crashed) return 'done'
      const t = now()
      restarts = restarts.filter((r) => t - r < LOOP_MS)
      if (restarts.length < LOOP_RESTARTS) {
        restarts.push(t)
        try { d.restart(); d.hiccup(); return 'restarted' } catch (err) { console.error('capture restart failed', err) }
      }
      d.giveUp()
      return 'stopped'
    },
  }
}

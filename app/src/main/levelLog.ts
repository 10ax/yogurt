/**
 * Once a minute while recording, how loud each side got (levels are 0..1 over -60..0 dB), for main.log. A report of
 * "the call isn't recorded" (#35) then shows whether the call side heard anything at all, and nothing of what was said.
 */
export function createLevelLog(everyMs = 60_000) {
  let since: number | undefined
  let me = 0, them = 0
  return (lv: { me: number; them: number }, now: number): string | undefined => {
    since ??= now
    me = Math.max(me, lv.me); them = Math.max(them, lv.them)
    if (now - since < everyMs) return undefined
    const line = `LEVEL last ${Math.round((now - since) / 1000)} s: loudest me ${me.toFixed(2)}, them ${them.toFixed(2)}${them < 0.05 ? ' (no call audio heard)' : ''}`
    since = now; me = 0; them = 0
    return line
  }
}

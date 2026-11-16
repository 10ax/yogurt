/**
 * Small models open an answer with where it came from ("Based on the provided transcript:") even when told not to.
 * The person sees their own meetings, not a "provided transcript", so that opening goes. Only an opening that names
 * the sources themselves goes: "Based on what Dana said, ..." is part of the answer and stays.
 */
const LEAD = /^\s*(?:based on|according to|going by)\s+(?:the\s+)?(?:provided\s+|given\s+|available\s+|above\s+)?(?:meeting\s+)?(?:transcripts?|sources?|notes|meetings?|context|excerpts?|information|records?)(?:\s+(?:provided|given|above|available))?(?:,?\s+here(?:'s| is| are)\b[^:\n]{0,80})?\s*([:,])[ \t]*/i
const OPENERS = ['based on ', 'according to ', 'going by ']
/** past this many characters without a colon or comma, the start is no such opening */
const DECIDED_AT = 120

/** The answer without that opening. While it streams, the first words wait until it is clear they aren't one. */
export function withoutPreamble(text: string, o: { streaming?: boolean } = {}): string {
  const m = LEAD.exec(text)
  if (m) {
    const rest = text.slice(m[0].length).replace(/^\s+/, '')
    return m[1] === ',' && rest ? rest[0].toLocaleUpperCase() + rest.slice(1) : rest
  }
  if (o.streaming) {
    const start = text.trimStart().toLocaleLowerCase()
    const mayBe = OPENERS.some((w) => w.startsWith(start) || start.startsWith(w))
    if (mayBe && start.length < DECIDED_AT && !/[:,.\n]/.test(start)) return ''
  }
  return text
}

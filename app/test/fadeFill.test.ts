import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// A fade that ends fully visible needs no forwards fill: with `both` the browser keeps every finished fade alive, one
// per transcript line or chat message, and a 3 h meeting held ~2,600 of them (the note window grew to 1.5 GB).
it('fades on things that pile up (lines, names, live words, chat messages) let go when they finish', () => {
  const css = readFileSync(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8')
  for (const cls of ['line-in', 'name-in', 'live-word', 'chat-in']) {
    const rules = [...css.matchAll(new RegExp(`\\.${cls}\\s*\\{[^}]*animation:\\s*motion-fade[^;}]*`, 'g'))].map((m) => m[0])
    expect(rules.length, cls).toBeGreaterThan(0)
    for (const r of rules) expect(r, cls).not.toMatch(/\b(both|forwards)\b/)
  }
})

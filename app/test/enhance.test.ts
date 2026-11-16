import { describe, expect, it, vi } from 'vitest'
import { cleanTitle, enhance, enhancePrompt, guessLanguage, languageName, peopleRule, summaryPrompt, titlePrompt, transcriptHead, type Llm, markMine, splitForContext, tidyNotes, transcriptText } from '../src/main/notes/enhance'
import type { Segment } from '../src/main/store'

const seg = (track: 'me' | 'them', startMs: number, text: string, speaker: string | null = track === 'me' ? 'me' : null): Segment =>
  ({ id: startMs, meetingId: 'm', track, startMs, endMs: startMs + 1000, text, speaker })
/** a word is a token: close enough for tests */
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

it.each(['count', 'summary', 'next steps'] as const)('stops after %s without starting more requests or accepting late tokens', async stage => {
  const abort = new AbortController(), token = vi.fn(), titleLater = vi.fn()
  let calls = 0
  const llm: Llm = {
    contextSize: 32000,
    count: async xs => { if (stage === 'count') abort.abort(); return xs.map(words) },
    chat: async (_prompt, onToken) => {
      calls++
      if (stage === 'summary' || stage === 'next steps' && calls === 2) { abort.abort(); onToken('Late token') }
      return '## Plan\n- Release on Thursday.'
    },
  }
  await expect(enhance({ signal: abort.signal, meeting: { title: 'Review', attendees: [] }, mine: '', segments: [], language: 'en', titleLater }, llm, token)).rejects.toMatchObject({ name: 'AbortError' })
  expect(calls).toBe(stage === 'count' ? 0 : stage === 'summary' ? 1 : 2)
  expect(token).not.toHaveBeenCalled()
  expect(titleLater).not.toHaveBeenCalled()
})

describe('enhancePrompt', () => {
  const base = { title: 'Launch sync', attendees: [{ name: 'Maya Chen', email: null }], mine: '- ship Tuesday\n- pricing?', transcript: 'You: Hi.\nMaya Chen: Hello.', language: 'Spanish' }
  it('keeps the default prompt byte-for-byte for an absent or blank rewrite note', () => {
    expect(enhancePrompt({ ...base, note: '' })).toBe(enhancePrompt(base))
    expect(enhancePrompt({ ...base, note: '  ' })).toBe(enhancePrompt(base))
  })
  it('adds a bounded presentation instruction after the full built-in prompt', () => {
    const original = enhancePrompt(base)
    const prompt = enhancePrompt({ ...base, note: '  shorter, in Spanish  ' })
    expect(prompt.startsWith(original)).toBe(true)
    expect(prompt).toContain('take precedence over the defaults above')
    expect(prompt).toContain('never invent facts')
    expect(prompt.endsWith('"shorter, in Spanish"')).toBe(true)
    expect(enhancePrompt({ ...base, note: 'x'.repeat(300) })).toContain('"' + 'x'.repeat(240) + '"')
    expect(tidyNotes('## Plan\nA short paragraph.\nA second paragraph.', true)).toBe('## Plan\nA short paragraph.\nA second paragraph.')
  })
  it('carries the person\'s own notes, the transcript and the language', () => {
    const p = enhancePrompt(base)
    expect(p).toContain('- ship Tuesday\n- pricing?')
    expect(p).toContain('You: Hi.\nMaya Chen: Hello.')
    expect(p).toContain('Spanish')
    expect(p).toContain('Maya Chen')
    expect(p).toContain('## ')
    expect(p).toContain('**')
  })
  it('without a known language, asks for the transcript\'s', () => {
    const p = enhancePrompt({ ...base, language: '' })
    expect(p).toMatch(/language .*transcript/i)
  })
  it('puts what stays the same first: instructions, transcript, the meeting, their notes, then how to write', () => {
    const p = enhancePrompt(base)
    const at = (x: string) => { const i = p.indexOf(x); expect(i).toBeGreaterThanOrEqual(0); return i }
    const order = [at('<transcript>'), at('Launch sync'), at('- ship Tuesday'), at('How to write them')]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // nothing about this meeting comes before the transcript, so it can be read in early
    const before = p.slice(0, at('<transcript>'))
    for (const x of ['Launch sync', 'Maya', 'Spanish', 'ship Tuesday']) expect(before).not.toContain(x)
  })
  it('says when there are no notes of their own', () => {
    expect(enhancePrompt({ ...base, mine: '  ' })).not.toContain('<notes>')
  })
})

describe('enhancePrompt: notes that read like a good note-taker wrote them', () => {
  const transcript = 'You: Hi Dana, can you hear me?\nThem: Yes, loud and clear.\nMaya Chen: Hello both.'
  const base = { title: 'Zoom call', attendees: [], mine: '', transcript, language: 'English', minutes: 4 }
  it('starts with the transcript exactly as it is read in during the meeting', () => {
    expect(enhancePrompt(base).startsWith(`${transcriptHead}${transcript}\n</transcript>\n`)).toBe(true)
  })
  it('the transcript head explains the labels the transcript uses: You, Them and names', () => {
    expect(transcriptHead).toContain('"You"')
    expect(transcriptHead).toContain('"Them"')
    expect(transcriptHead).toMatch(/name/)
    expect(transcriptHead.endsWith('<transcript>\n')).toBe(true)
  })
  it('never talks of speaker letters', () => {
    for (const p of [enhancePrompt(base), transcriptHead, peopleRule, summaryPrompt('You: hi', 1, 'English'), titlePrompt('English')]) {
      expect(p).not.toMatch(/Speaker [A-Z]\b/)
      expect(p).not.toMatch(/letter/i)
    }
  })
  it('leads with the work, most important topic first, leaves out what was off topic, and next steps only when someone took one on', () => {
    const p = enhancePrompt(base)
    const how = p.slice(p.indexOf('</transcript>'))
    for (const x of ['## Next steps', '**', 'by when', 'about 4 minutes', 'Never make anything up', 'small talk', 'most important first', 'side projects']) expect(how).toContain(x)
    // no sections that restate the topics: what it was for and what came of it belong in the topics
    for (const x of ['## Purpose', '## Outcome']) expect(how).not.toContain(x)
    const shape = how.slice(how.lastIndexOf('## <topic>'))
    expect(shape.indexOf('## <topic>')).toBe(0)
    expect(shape.indexOf('## <topic>')).toBeLessThan(shape.indexOf('## Next steps'))
    expect(how).toMatch(/Next steps[^\n]*only if/)
  })
  it('a meeting in one room, heard on one mic, is said to be several people under "You"', () => {
    expect(enhancePrompt({ ...base, oneMic: true })).toMatch(/one microphone/)
    expect(enhancePrompt(base)).not.toMatch(/one microphone/)
  })
  it('a short meeting is never told to keep it brief', () => {
    for (const minutes of [1, 4, 9]) {
      const p = enhancePrompt({ ...base, minutes })
      expect(p).not.toMatch(/brief|keep it short/i)
      expect(p).toMatch(/fewer sections/)
    }
  })
  it('with one other person invited, "Them" is that person', () => {
    expect(enhancePrompt({ ...base, attendees: [{ name: 'Dana Lund', email: null }] })).toContain('"Them" is Dana Lund')
    // the person who recorded it is not the other one
    expect(enhancePrompt({ ...base, attendees: [{ name: 'Alex Morgan', email: null }, { name: 'Dana Lund', email: null }], me: 'Alex Morgan' })).toContain('"Them" is Dana Lund')
    expect(enhancePrompt({ ...base, attendees: [{ name: 'Dana Lund', email: null }, { name: 'Maya Chen', email: null }] })).not.toMatch(/"Them" is (Dana|Maya)/)
  })
  it('the instructions say who is who after the transcript, never before', () => {
    const p = enhancePrompt({ ...base, attendees: [{ name: 'Dana Lund', email: null }] })
    expect(p.indexOf('Dana Lund')).toBeGreaterThan(p.indexOf('</transcript>'))
  })
})

describe('meeting titles from the notes', () => {
  it('titlePrompt asks for a short specific title in the meeting\'s language', () => {
    const p = titlePrompt('Spanish')
    expect(p).toContain('Spanish')
    expect(p).toMatch(/title/i)
    expect(p).toMatch(/70/)
  })
  it('cleanTitle: the first line, no quotes, label, heading marks or closing period; too long is cut at a word', () => {
    expect(cleanTitle('"Testing Yogurt transcription accuracy with Dana."')).toBe('Testing Yogurt transcription accuracy with Dana')
    expect(cleanTitle('Title: **Pricing for schools**\nmore')).toBe('Pricing for schools')
    expect(cleanTitle('## Q3 roadmap review')).toBe('Q3 roadmap review')
    expect(cleanTitle('«Revisión de precios»')).toBe('Revisión de precios')
    expect(cleanTitle('NONE')).toBe('')
    expect(cleanTitle('   ')).toBe('')
    const long = cleanTitle('word '.repeat(40))
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('word')).toBe(true)
  })
  it('enhance asks for a title after the notes, following on from them, only when asked to', async () => {
    const calls: Array<{ prompt: string; before?: string[] }> = []
    const llm: Llm = {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken, o) => {
        calls.push({ prompt, before: o?.before })
        const r = calls.length === 1 ? '## Purpose\n- Test the mic\n## Next steps\n- **You:** Ship it.' : '"Testing the mic with Dana"'
        onToken(r); return r
      },
    }
    let ask: ((l: Llm) => Promise<string>) | undefined
    const out: string[] = []
    const md = await enhance({ meeting: { title: 'Zoom call', attendees: [] }, mine: '', segments: [seg('me', 0, 'Hi')], language: 'en', titleLater: (a) => { ask = a } }, llm, (t) => out.push(t))
    // asked for only once the notes are back, so it never holds them up
    expect(calls).toHaveLength(1)
    expect(await ask!(llm)).toBe('Testing the mic with Dana')
    expect(calls).toHaveLength(2)
    expect(calls[1].before).toEqual([calls[0].prompt, '## Purpose\n- Test the mic\n## Next steps\n- **You:** Ship it.'])
    // the title is never part of the notes, nor streamed with them
    expect(md).not.toContain('Testing the mic')
    expect(out.join('')).not.toContain('Testing the mic')
    calls.length = 0
    await enhance({ meeting: { title: 'Zoom call', attendees: [] }, mine: '', segments: [seg('me', 0, 'Hi')], language: 'en' }, llm, () => {})
    expect(calls).toHaveLength(1)
  })
  it('a failed title never fails the notes', async () => {
    let n = 0
    const llm: Llm = {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (_p, onToken) => { if (n++) throw new Error('boom'); const r = '## Purpose\n- x\n## Next steps\n- **You:** y'; onToken(r); return r },
    }
    let ask: ((l: Llm) => Promise<string>) | undefined
    expect(await enhance({ meeting: { title: 'Zoom call', attendees: [] }, mine: '', segments: [seg('me', 0, 'Hi')], language: 'en', titleLater: (a) => { ask = a } }, llm, () => {})).toContain('## Purpose')
    expect(await ask!(llm)).toBe('')
  })
})

describe('transcriptText', () => {
  it('joins lines into turns: You for the mic, the name from the call, or Them', () => {
    const text = transcriptText([seg('me', 0, 'Hi all.'), seg('me', 1000, 'Shall we start?'), seg('them', 2000, 'Sure.', 'Maya Chen'), seg('them', 3000, 'Yes.', 'Dana Smith'), seg('them', 4000, 'Hm.'), seg('them', 5000, 'Right.')])
    expect(text).toBe('You: Hi all. Shall we start?\nMaya Chen: Sure.\nDana Smith: Yes.\nThem: Hm. Right.')
  })
})

describe('splitForContext', () => {
  const turns = Array.from({ length: 60 }, (_, i) => `${i % 2 ? 'You' : 'Speaker A'}: ${'word '.repeat(5 + (i * 7) % 30).trim()} end${i}.`)
  const transcript = turns.join('\n')
  it('never cuts inside a turn, and every piece is under the max', () => {
    const pieces = splitForContext(transcript, 120, words)
    expect(pieces.length).toBeGreaterThan(1)
    for (const p of pieces) {
      expect(words(p)).toBeLessThanOrEqual(120)
      for (const line of p.split('\n')) expect(turns).toContain(line)
    }
    expect(pieces.join('\n')).toBe(transcript)
  })
  it('keeps a transcript that fits whole', () => {
    expect(splitForContext(transcript, 1e6, words)).toEqual([transcript])
  })
  it('a single turn longer than the max is cut at sentences, keeping who said it', () => {
    const long = `Speaker A: ${Array.from({ length: 20 }, (_, i) => `Sentence number ${i} here.`).join(' ')}`
    const pieces = splitForContext(long, 30, words)
    expect(pieces.length).toBeGreaterThan(1)
    for (const p of pieces) { expect(words(p)).toBeLessThanOrEqual(30); expect(p.startsWith('Speaker A: ')).toBe(true) }
  })
})

describe('tidyNotes and markMine', () => {
  it('drops blank lines, so the editor shows no empty paragraphs between sections', () => {
    expect(tidyNotes('## A\n\n- b\n\n\n## C\n- d')).toBe('## A\n- b\n## C\n- d')
  })
  it('drops a preamble, code fences and a closing remark', () => {
    expect(tidyNotes('Sure! Here are your notes:\n```markdown\n## Plan\n- Ship it\n```\nLet me know if you need anything else.')).toBe('## Plan\n- Ship it')
  })
  it.each([
    '## Plan\nShip on Tuesday.\nKeep the first release small.',
    'Ship on Tuesday.\nKeep the first release small.',
    '| Task | Due |\n| --- | --- |\n| Release | Tuesday |',
  ])('removes rewrite wrappers while keeping the whole body (%s)', body => {
    expect(tidyNotes(`Sure! Here is the shorter version:\n\n${body}\n\nLet me know if you would like any changes.`, true)).toBe(body)
  })
  it('marks a bullet that says what the person wrote, when the model did not', () => {
    const md = markMine('## Plan\n- Ship the site on Tuesday\n- Budget is fine', '- ship site tuesday')
    expect(md).toBe('## Plan\n- <mine>Ship the site on Tuesday</mine>\n- Budget is fine')
  })
  it('unmarks what the model marked as theirs when they typed nothing like it', () => {
    expect(markMine('- <mine>team roles</mine>\n  - <mine>design a new remote</mine>', '- new remote control project\n- intros')).toBe('- team roles\n  - <mine>design a new remote</mine>')
  })
  it('leaves bullets the model already marked', () => {
    expect(markMine('- <mine>Ship</mine> on Tuesday', 'ship on tuesday')).toBe('- <mine>Ship</mine> on Tuesday')
  })
})

describe('languageName', () => {
  it('names a language code in English, empty when unknown', () => {
    expect(languageName('es')).toBe('Spanish')
    // whisper-server says the full name
    expect(languageName('spanish')).toBe('Spanish')
    expect(languageName(null)).toBe('')
  })
})

describe('enhance', () => {
  const meeting = { title: 'Sync', attendees: [] }
  // 400 turns of 22 words: about 9,000 words, more than an 8k context holds
  const segs = Array.from({ length: 400 }, (_, i) => seg(i % 2 ? 'me' : 'them', i * 1000, `topic${i} ${'blah '.repeat(20)}`, i % 2 ? 'me' : 'A'))
  it('stops a long meeting between parts without asking for the remaining parts', async () => {
    const abort = new AbortController(), part = vi.fn(), token = vi.fn()
    const chat = vi.fn(async () => { abort.abort(); return 'Abandoned part' })
    await expect(enhance({ signal: abort.signal, meeting, mine: '', segments: segs, language: 'en' }, {
      contextSize: 8192, count: async xs => xs.map(words), chat,
    }, token, part)).rejects.toMatchObject({ name: 'AbortError' })
    expect(part).toHaveBeenCalledOnce()
    expect(chat).toHaveBeenCalledOnce()
    expect(token).not.toHaveBeenCalled()
  })
  it("writes the transcript with the meeting's spellings, and tells the model how to spell them", async () => {
    const prompts: string[] = []
    const spell = { title: '', names: ['Tarun Shah'], companies: ['Zentrik'] }
    await enhance({ meeting, mine: '', segments: [seg('them', 0, 'Taran likes the Zentric checklist', 'Tarun Shah')], language: 'en', words: spell }, {
      contextSize: 100_000, count: async (xs) => xs.map(words), chat: async (prompt) => { prompts.push(prompt); return '## A\n- **You:** b' },
    }, () => {})
    expect(prompts[0]).toContain('Tarun likes the Zentrik checklist')
    expect(prompts[0]).toContain('These are spelled right: Zentrik, Tarun Shah')
  })
  it('tells the model when only the mic heard anyone: a meeting in a room', async () => {
    const prompts: string[] = []
    const llm: Llm = { contextSize: 100_000, count: async (xs) => xs.map((x) => x.split(' ').length), chat: async (p) => { prompts.push(p); return '## Plan\n- Ship it\n## Next steps\n- **You:** Ship it.' } }
    const room = [seg('me', 0, 'Pricing for the retail customer is next.'), seg('me', 5000, 'I think we offer a volume pack.'), seg('them', 9000, 'Bye.')]
    await enhance({ meeting: { title: 'Standup', attendees: [] }, mine: '', segments: room, language: 'en' }, llm, () => {})
    await enhance({ meeting: { title: 'Call', attendees: [] }, mine: '', segments: [...room, seg('them', 12000, 'We would rather pay per query than buy a pack up front.')], language: 'en' }, llm, () => {})
    expect(prompts[0]).toMatch(/one microphone/)
    expect(prompts[1]).not.toMatch(/one microphone/)
  })
  it('writes the notes in one go when the transcript fits', async () => {
    const prompts: string[] = []
    const out: string[] = []
    const md = await enhance({ meeting, mine: '', segments: segs, language: 'en' }, {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken) => { prompts.push(prompt); onToken('## A\n'); onToken('- **You:** b'); return '## A\n- **You:** b' },
    }, (t) => out.push(t))
    expect(prompts).toHaveLength(1)
    expect(md).toBe('## A\n- **You:** b')
    expect(out.join('')).toBe('## A\n- **You:** b')
  })
  it('notes that came back without next steps get them asked for, after what was written', async () => {
    const calls: Array<{ prompt: string; before?: string[] }> = []
    const out: string[] = []
    const md = await enhance({ meeting, mine: '', segments: segs.slice(0, 4), language: 'en' }, {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken, o) => {
        calls.push({ prompt, before: o?.before })
        const r = calls.length === 1 ? '## Plan\n- Ship it' : '## Next steps\n- **You:** Ship it.'
        onToken(r); return r
      },
    }, (t) => out.push(t))
    expect(calls).toHaveLength(2)
    expect(calls[1].before).toEqual([calls[0].prompt, '## Plan\n- Ship it'])
    expect(calls[1].prompt).toContain('Next steps')
    expect(md).toBe('## Plan\n- Ship it\n## Next steps\n- **You:** Ship it.')
    expect(out.join('')).toBe(md)
  })
  it('notes that went through the whole shape without next steps had none: nothing more is asked', async () => {
    let n = 0
    const md = await enhance({ meeting, mine: '', segments: segs.slice(0, 4), language: 'en' }, {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (_p, onToken) => { n++; const r = '## Purpose\n- Test the mic\n## Audio setup\n- Headphones on\n## Outcome\n- It works'; onToken(r); return r },
    }, () => {})
    expect(n).toBe(1)
    expect(md).toContain('## Outcome')
  })
  it('summarises each piece of a long meeting, then writes from the summaries, covering start and end', async () => {
    const prompts: string[] = []
    const parts: Array<[number, number]> = []
    const md = await enhance({ meeting, mine: '- my point', segments: segs, language: 'en' }, {
      contextSize: 8192, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken, o) => {
        prompts.push(prompt)
        if (o?.summary) { const topics = prompt.match(/topic\d+/g) ?? []; return `- ${topics.join(' ')}` }
        onToken('## Done\n- **You:** x'); return '## Done\n- **You:** x'
      },
    }, () => {}, (part, of) => parts.push([part, of]))
    expect(parts).toEqual([[1, 2], [2, 2]])
    expect(prompts.length).toBeGreaterThan(2)
    const last = prompts.at(-1)!
    expect(last).toContain('topic0')
    expect(last).toContain('topic399')
    expect(last).toContain('- my point')
    // their notes steer the summary; nothing of theirs is pasted in after it
    expect(md).toBe('## Done\n- **You:** x')
  })
  it.each([undefined, 'Write a shorter summary in Spanish'])('a long meeting reuses part summaries and applies the rewrite note only to the final summary (%s)', async note => {
    const lines = transcriptText(segs).split('\n')
    const earlier = [{ lines: lines.slice(0, 150), summary: '- early topic0' }]
    const summarised: string[] = []
    const parts: Array<[number, number]> = []
    let last = ''
    await enhance({ meeting, mine: '', segments: segs, language: 'en', note }, {
      contextSize: 8192, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken, o) => {
        if (o?.summary) { summarised.push(prompt); return `- ${(prompt.match(/topic\d+/g) ?? []).join(' ')}` }
        last = prompt; onToken('## Done\n- **You:** x'); return '## Done\n- **You:** x'
      },
    }, () => {}, (part, of) => parts.push([part, of]), earlier)
    // nothing from the reused part is summarised again
    expect(summarised.join('\n')).not.toMatch(/\btopic(0|149)\b/)
    expect(summarised.join('\n')).toContain('topic150')
    expect(parts[0][0]).toBe(2)
    expect(last).toContain('- early topic0')
    expect(last).toContain('topic399')
    if (note) { expect(last).toContain(note); expect(summarised.join('\n')).not.toContain(note) }
  })
  it('a part whose lines changed since (new speaker letters) is summarised again', async () => {
    const earlier = [{ lines: ['Speaker Z: not what was said'], summary: '- stale' }]
    let last = ''
    await enhance({ meeting, mine: '', segments: segs, language: 'en' }, {
      contextSize: 8192, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken, o) => {
        if (o?.summary) return `- ${(prompt.match(/topic\d+/g) ?? []).join(' ')}`
        last = prompt; onToken('## Done\n- **You:** x'); return '## Done\n- **You:** x'
      },
    }, () => {}, undefined, earlier)
    expect(last).not.toContain('- stale')
    expect(last).toContain('topic0')
  })
})

describe('fix round 1', () => {
  const llmWith = (reply: string, prompts: string[] = []): Llm => ({
    contextSize: 100_000, count: async (xs) => xs.map(words),
    chat: async (prompt, onToken) => { prompts.push(prompt); onToken(reply); return reply },
  })
  // made up: a call script typed (or pasted) as plain lines, which the editor saves with their markers escaped
  const script = [
    'CALL SCRIPT (first call, 20 min)',
    'GOAL',
    'Find out if the demo is worth a second call',
    'WHO',
    '\\- Inbound, first touch from the pricing page',
    'QUESTIONS',
    '1\\. "Have y\'all looked at moving rosters off spreadsheets?"',
    '2\\. "Which product do you use for ordering today?"',
    'NO SCREEN SHARE until they answer #2.',
    'CLOSE',
    '\\- Book the follow-up before hanging up',
  ].join('\n')
  it('their notes are hints for the summary: focus and facts, in its own words, never pasted, never a script read as said', () => {
    const p = enhancePrompt({ title: 'Intro call', attendees: [], mine: script, transcript: 'You: Hi.', language: 'English' })
    expect(p).toContain(script)
    expect(p).toMatch(/own words/)
    expect(p).toMatch(/never copy their lines/i)
    expect(p).toMatch(/labels/)
    expect(p).toMatch(/numbering/)
    expect(p).toMatch(/only if the transcript shows/)
    expect(p).toMatch(/flagged/)
    expect(p).not.toMatch(/every typed point/)
    expect(p).not.toContain('<mine>')
  })
  it('nothing they typed is added to the summary after it, whatever the model left out', async () => {
    const reply = '## Bakery rosters\n- Rosters live in spreadsheets, rebuilt every Monday\n## Next steps\n- **You:** Send the pricing sheet'
    const md = await enhance({ meeting: { title: 'Intro call', attendees: [] }, mine: script, segments: [seg('me', 0, 'Hi')], language: 'en' }, llmWith(reply), () => {})
    expect(md).toBe(reply)
  })
  it('a bullet that copied a typed marker or label comes out with one marker and no label', async () => {
    const reply = '## Questions\n- 2. "Which product do you use for ordering today?" Shopify, for now\n- - Inbound from the pricing page\n- CLOSE\n- **GOAL**\n  - 1\\. Rosters still on spreadsheets\n## Next steps\n- **You:** Send the pricing sheet'
    const md = await enhance({ meeting: { title: 'Intro call', attendees: [] }, mine: script, segments: [seg('me', 0, 'Hi')], language: 'en' }, llmWith(reply), () => {})
    // what says their point is still shown as theirs
    expect(md).toBe('## Questions\n- <mine>"Which product do you use for ordering today?" Shopify, for now</mine>\n- <mine>Inbound from the pricing page</mine>\n  - Rosters still on spreadsheets\n## Next steps\n- **You:** Send the pricing sheet')
    expect(md).not.toMatch(/^\s*[-*+]\s+(\\?[-*+]|\d+\\?[.)])\s/m)
  })
  it('markMine reads a typed line the same with its marker escaped', () => {
    expect(markMine('## Q\n- Which product do you use for ordering today', '2\\. "Which product do you use for ordering today?"')).toBe('## Q\n- <mine>Which product do you use for ordering today</mine>')
  })
  it('guessLanguage: the script, or the commonest little words', () => {
    expect(guessLanguage('来週の予定はどうなっていますか', 'English')).toBe('Japanese')
    expect(guessLanguage('¿Qué se decidió sobre el precio de la versión?', 'English')).toBe('Spanish')
    expect(guessLanguage('Was wurde über den Preis und die Version entschieden?', 'English')).toBe('German')
    expect(guessLanguage('What was decided about pricing?', 'Spanish')).toBe('English')
    expect(guessLanguage('ok', 'French')).toBe('French')
  })
})


it('excludes the owner in the shared title prompt and rejects names despite model instructions', async () => {
  const me = 'Owner Example'
  expect(titlePrompt('English', me, [{ name: me, email: null }, { name: 'Guest', email: null }])).toContain('["Guest"]')
  for (const raw of ['Plan with Owner Example', 'Plan with OWNER', "Example’s plan", 'Plan with Owner Example ' + 'word '.repeat(40)]) {
    expect(cleanTitle(raw, me)).toBe('')
  }
  expect(cleanTitle('Plan with Guest', me)).toBe('Plan with Guest')
  expect(cleanTitle('Ownerrama plan', me)).toBe('Ownerrama plan')
  let ask!: (model: Llm) => Promise<string>
  const llm: Llm = { contextSize: 32000, count: async xs => xs.map(x => x.length), chat: async p =>
    p.startsWith('Now give this meeting a title') ? 'Plan with Owner Example' : '## Plan\n- **You:** Send the plan.' }
  await enhance({ meeting: { title: 'Call', attendees: [{ name: me, email: null }] }, me, mine: '',
    segments: [seg('me', 0, 'Plan the release')], language: 'en', titleLater: a => { ask = a } }, llm, () => {})
  expect(await ask(llm)).toBe('')
})

describe('summary language preference', () => {
  it.each([
    { language: 'es', summaryLanguage: undefined, expected: 'Spanish' },
    { language: null, summaryLanguage: '', expected: 'the language most of the transcript is in' },
    { language: 'es', summaryLanguage: 'fr', expected: 'French' },
    { language: null, summaryLanguage: 'zh-TW', expected: 'Chinese (Traditional)' },
    { language: 'es', summaryLanguage: 'unknown', expected: 'Spanish' },
  ])('uses $expected for notes, next steps and the deferred title', async ({ language, summaryLanguage, expected }) => {
    const calls: Array<{ prompt: string; before?: string[] }> = []
    const selected = summaryLanguage === 'fr' || summaryLanguage === 'zh-TW'
    const llm: Llm = {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (prompt, onToken, o) => {
        calls.push({ prompt, before: o?.before })
        const reply = calls.length === 1 ? '## Plan\n- Ship Tuesday.' : calls.length === 2 ? '## Next steps\n- **You:** Send the plan.' : 'Shipping plan'
        onToken(reply); return reply
      },
    }
    let title!: (model: Llm) => Promise<string>
    await enhance({ meeting: { title: '', attendees: [] }, mine: '', segments: [seg('me', 0, 'Send the plan.')], language, summaryLanguage, titleLater: (ask) => { title = ask } }, llm, () => {})
    await title(llm)
    expect(calls).toHaveLength(3)
    expect(calls[0].prompt).toContain(selected ? `By default, write in ${expected}, headings too.` : `Write in ${expected}, headings too.`)
    expect(calls[0].prompt).toContain(`"## Next steps" (in ${selected ? 'the same language as the rest of the notes' : expected})`)
    if (selected) {
      expect(calls[0].prompt).toContain('A rewrite note asking for another language takes precedence over this default.')
      expect(calls[1].prompt).toContain('heading in the same language as the notes; write the bullets in that language too')
      expect(calls[2].prompt).toContain('title, in the same language as the notes')
      for (const call of calls.slice(1)) expect(call.prompt).not.toContain(expected)
    } else {
      expect(calls[0].prompt).not.toContain('By default')
      expect(calls[1].prompt).toContain(`heading in ${language ? expected : 'the same language'}`)
      expect(calls[2].prompt).toContain(`title, in ${language ? expected : 'the same language as the notes'}`)
    }
    for (const call of calls.slice(1)) expect(call.before).toEqual([calls[0].prompt, '## Plan\n- Ship Tuesday.'])
  })

  it('uses the selected language for final notes even when reusing meeting-language part summaries', async () => {
    const segments = [seg('me', 0, 'Send the plan.')]
    const prompts: string[] = []
    const llm: Llm = {
      contextSize: 100_000, count: async (xs) => xs.map(words),
      chat: async (prompt) => { prompts.push(prompt); return '## Plan\n- **You:** Send it.' },
    }
    await enhance({ meeting: { title: '', attendees: [] }, mine: '', segments, language: 'es', summaryLanguage: 'de' }, llm, () => {}, undefined,
      [{ lines: transcriptText(segments).split('\n'), summary: '### Plan\n- Enviar el plan.' }])
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('Enviar el plan.')
    expect(prompts[0]).toContain('By default, write in German')
  })
})

it.each(['in Spanish', 'shorter'])('keeps the summary language default and rewrite instruction %s through next steps and titles', async (note) => {
  const prompts: string[] = []
  let askTitle: ((llm: Llm) => Promise<string>) | undefined
  const llm: Llm = {
    contextSize: 32000, count: async xs => xs.map(words),
    chat: async prompt => { prompts.push(prompt); return prompt.startsWith('Now') ? 'NONE' : '## Plan\nA short paragraph.' },
  }
  const result = await enhance({ meeting: { title: 'Plan', attendees: [] }, mine: '', segments: [seg('me', 0, 'Release on Tuesday.')], language: 'en', summaryLanguage: 'fr', note, titleLater: ask => { askTitle = ask } }, llm, () => {})
  await askTitle!(llm)
  expect(result).toBe('## Plan\nA short paragraph.')
  expect(prompts).toHaveLength(3)
  expect(prompts.every(prompt => prompt.includes(note))).toBe(true)
  expect(prompts[0]).toContain('By default, write in French')
  expect(prompts[0]).toContain('A rewrite note asking for another language takes precedence')
  expect(prompts[0].indexOf(JSON.stringify(note))).toBeGreaterThan(prompts[0].indexOf('By default, write in French'))
  expect(prompts[1]).toContain('heading in the same language as the notes')
  expect(prompts[2]).toContain('title, in the same language as the notes')
  for (const prompt of prompts.slice(1)) {
    expect(prompt).not.toContain('French')
    expect(prompt).not.toContain('English')
  }
  expect(prompts[1]).toContain('excludes next steps')
  expect(prompts[2]).toContain('other requests apply only to the notes')
})

it('cleans a shorter rewrite with a lead-in line and a closing remark', async () => {
  const body = '## Plan\n- Ship on Tuesday.\n- Keep the first release small.'
  const llm: Llm = {
    contextSize: 32000, count: async xs => xs.map(words),
    chat: async prompt => prompt.startsWith('Now') ? 'NONE' : `Here is a shorter version:\n${body}\nLet me know if you need anything else.`,
  }
  const result = await enhance({ meeting: { title: 'Plan', attendees: [] }, mine: '', segments: [seg('me', 0, 'Release on Tuesday.')], language: 'en', note: 'shorter' }, llm, () => {})
  expect(result).toBe(body)
})

import { describe, expect, it } from 'vitest'
import { searchDateLabel, searchFilterEmptyMessage, searchFilterHighlights } from '../src/renderer/src/searchFilters'
import { matchSearchPeople, removeSearchSpan } from '../src/shared/searchPeople'
import { parseSearchQuery } from '../src/shared/searchQuery'
import { searchPalette } from '../src/renderer/src/searchRanking'

const person = { name: 'Riley Example', email: 'riley@example.test' }
const commands = [{ label: 'Settings', group: 'Go to' }]

describe('search filters', () => {
  it('shows a compact range pill and highlights and removes the complete range', () => {
    const query = 'planning from Jun 8 to Jun 10'
    const parsed = parseSearchQuery(query, { now: new Date(2026, 6, 1), locale: 'en-US' })
    expect(searchDateLabel(parsed.date!, 'en-US')).toBe(new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).formatRange(new Date(2026, 5, 8), new Date(2026, 5, 10)))
    expect(searchFilterHighlights(query, [], parsed.dateSpan)).toEqual([
      { text: 'planning ' }, { text: 'from Jun 8 to Jun 10', kind: 'date' },
    ])
    expect(removeSearchSpan(query, parsed.dateSpan!)).toBe('planning')
  })

  it('highlights people and dates in place without changing the original input', () => {
    const query = 'notes with Riley Example today'
    const people = matchSearchPeople(query, [person])
    const date = parseSearchQuery(people.text)
    const parts = searchFilterHighlights(query, people.matches, date.dateSpan)
    expect(parts).toEqual([
      { text: 'notes with ' }, { text: person.name, kind: 'person' },
      { text: ' ' }, { text: 'today', kind: 'date' },
    ])
    expect(parts.map(p => p.text).join('')).toBe(query)
    expect(removeSearchSpan(query, people.matches[0])).toBe('notes with today')
    expect(removeSearchSpan(query, date.dateSpan!)).toBe('notes with Riley Example')
  })

  it.each([person.name, person.email, 'today', `${person.name} today`, `${person.name} settings`])('hides commands for the filter %s, even without remaining words', query => {
    const people = matchSearchPeople(query, [person])
    const date = parseSearchQuery(people.text)
    const filtered = !!date.date || people.matches.length > 0
    const palette = searchPalette(commands, [{ confident: true }], query, query, [], undefined, filtered)
    expect(palette.rows.map(r => r.kind)).toEqual(['ask', 'meeting'])
    expect(palette.rows[palette.active].kind).toBe('meeting')
  })

  it('names the filters with no matches while keeping Ask available and selected', () => {
    expect(searchFilterEmptyMessage([person])).toBe('No matching meetings with Riley Example.')
    expect(searchFilterEmptyMessage([], 'Monday')).toBe('No matching meetings on Monday.')
    expect(searchFilterEmptyMessage([person], 'Monday')).toBe('No matching meetings with Riley Example on Monday.')
    expect(searchFilterEmptyMessage([])).toBeUndefined()
    const palette = searchPalette(commands, [], person.name, person.name, [], undefined, true)
    expect(palette.rows).toEqual([{ kind: 'ask', query: person.name }])
    expect(palette.active).toBe(0)
  })

  it('restores ordinary commands after filter text is deleted', () => {
    const query = removeSearchSpan(person.name, matchSearchPeople(person.name, [person]).matches[0])
    expect(searchFilterHighlights(query, [])).toEqual([])
    expect(searchPalette(commands, [], query).rows.map(r => r.kind)).toEqual(['command'])
  })
})

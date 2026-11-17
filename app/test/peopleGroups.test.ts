import { expect, it } from 'vitest'
import { groupPeople, initials } from '../src/shared/people'

const row = (email: string | null, i: number) => ({ p: { name: `Attendee ${i}`, email }, i })
it('groups case-insensitive domains, sorts company labels and preserves original rows and indices', () => {
  const rows = [row('one@zeta.example', 0), row(' TWO@NORTH-LINE.EXAMPLE ', 1), row('three@north-line.example', 2), row('four@north-line.test', 3)]
  const groups = groupPeople(rows)
  expect(groups.map(g => g.label)).toEqual(['North Line', 'North Line', 'Zeta'])
  expect(groups.map(g => g.domain)).toEqual(['north-line.example', 'north-line.test', 'zeta.example'])
  expect(groups[0].people).toEqual([rows[1], rows[2]])
  expect(groups[0].people[0]).toBe(rows[1])
})
it('keeps personal, missing and invalid email addresses in the last group', () => {
  const emails = ['gmail.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com', 'proton.me', 'protonmail.com', 'mail.example'].map(domain => `attendee@${domain}`)
  const rows = [...emails, null, '', 'invalid', 'one@@example.com', 'one@example', 'one@two words.example'].map(row)
  const groups = groupPeople([...rows, row('one@work.example', 99)])
  expect(groups.map(g => g.domain)).toEqual(['work.example', ''])
  expect(groups[1].people).toEqual(rows)
  expect(groups[1].label).toBe('')
  expect(groupPeople([])).toEqual([])
})
it('keeps self markers and derives initials from the first and last words', () => {
  const mine = { ...row('me@work.example', -1), mine: true }
  expect(groupPeople([mine])[0].people[0]).toBe(mine)
  expect(initials(' Attendee   Middle One ')).toBe('AO')
  expect(initials('Attendee')).toBe('A')
  expect(initials('')).toBe('')
  expect(initials('参会 者')).toBe('参者')
  expect(initials('𐐨 Test')).toBe('𐐀T')
})

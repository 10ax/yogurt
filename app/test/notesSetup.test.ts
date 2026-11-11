import { describe, expect, it } from 'vitest'
import { notesPercent, notesReadyNotice } from '../src/renderer/src/notesSetup'
import type { SetupState } from '../src/shared/types'

const downloading: SetupState = { phase: 'ready', fraction: 1, notesDownloading: true, notesFraction: 0.42 }
const ready: SetupState = { phase: 'ready', fraction: 1 }

describe('first notes model progress', () => {
  it('clamps and floors progress without rounding up before the download finishes', () => {
    expect([-0.1, 0, 0.429, 0.999, 1, 2].map(notesPercent)).toEqual(['0%', '0%', '42%', '99%', '100%', '100%'])
  })
  it('announces once after a noticeable download, never again on ready updates', () => {
    const notice = notesReadyNotice()
    expect(notice(downloading, true, 0)).toBe(false)
    expect(notice(downloading, true, 1100)).toBe(false)
    expect(notice(ready, true, 1200)).toBe(true)
    expect(notice(ready, true, 1300)).toBe(false)
    expect(notice(downloading, true, 1400)).toBe(false)
    expect(notice(ready, true, 3000)).toBe(false)
  })
  it('skips cached launches, brief downloads, and downloads only seen while hidden', () => {
    expect(notesReadyNotice()(ready, true, 5000)).toBe(false)
    const brief = notesReadyNotice()
    brief(downloading, true, 0)
    expect(brief(ready, true, 999)).toBe(false)
    const hidden = notesReadyNotice()
    hidden(downloading, false, 0)
    expect(hidden(ready, false, 5000)).toBe(false)
    expect(hidden(ready, true, 6000)).toBe(false)
  })
  it('does not mistake a failed download for readiness; a retry can finish it', () => {
    const notice = notesReadyNotice()
    notice(downloading, true, 0)
    expect(notice({ ...ready, notesError: 'Offline' }, true, 2000)).toBe(false)
    expect(notice(downloading, true, 3000)).toBe(false)
    expect(notice(ready, true, 4000)).toBe(true)
  })
  it('does not count hidden time toward a briefly visible download', () => {
    const notice = notesReadyNotice()
    notice(downloading, true, 0)
    notice(downloading, false, 100)
    expect(notice(ready, false, 5000)).toBe(false)
  })
})

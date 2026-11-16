import { describe, expect, it } from 'vitest'
import { feedRecording } from '../src/main/asr/backfill'

async function* from(...parts: number[][]): AsyncGenerator<Float32Array> { for (const p of parts) yield Float32Array.from(p) }
const ones = (n: number) => new Array(n).fill(1)

describe('a recording transcribed after the meeting (#30)', () => {
  it('feeds both tracks in 100 ms pieces on meeting time, side by side so echo detection lines them up', async () => {
    const pushed: Array<[string, number, number]> = []
    const ms = await feedRecording({
      tracks: { me: from(ones(2500), ones(700)), them: from(ones(3200)) },
      push: (t, at, s) => pushed.push([t, at, s.length]), backlogMs: () => 0,
    })
    expect(pushed).toEqual([['me', 0, 1600], ['them', 0, 1600], ['me', 100, 1600], ['them', 100, 1600]])
    expect(ms).toBe(200)
  })
  it('keeps the last short piece', async () => {
    const pushed: Array<[string, number, number]> = []
    await feedRecording({ tracks: { me: from(ones(1700)) }, push: (t, at, s) => pushed.push([t, at, s.length]), backlogMs: () => 0 })
    expect(pushed).toEqual([['me', 0, 1600], ['me', 100, 100]])
  })
  it('waits while whisper is behind, so the pipeline never drops audio it was given', async () => {
    let backlog = 90_000, waits = 0
    const pushed: number[] = []
    await feedRecording({
      tracks: { them: from(ones(1600)) }, push: (_t, at) => pushed.push(at), backlogMs: () => backlog, maxBacklogMs: 60_000,
      wait: async () => { waits++; if (waits === 3) backlog = 1000 },
    })
    expect(waits).toBe(3)
    expect(pushed).toEqual([0])
  })
  it('stops when told to (a new recording started)', async () => {
    const pushed: number[] = []
    let n = 0
    await feedRecording({ tracks: { me: from(ones(16000)) }, push: (_t, at) => { pushed.push(at); n++ }, backlogMs: () => 0, stopped: () => n >= 3 })
    expect(pushed).toEqual([0, 100, 200])
  })
})

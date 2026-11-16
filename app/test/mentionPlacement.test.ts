import { describe, expect, it } from 'vitest'
import { mentionPosition } from '../src/renderer/src/mentionPlacement'

describe('mention placement', () => {
  const menu = { width: 380, height: 280 }, viewport = { width: 1000, height: 800 }
  it('opens four pixels below the @ line, aligned to the character', () => {
    expect(mentionPosition({ left: 120, top: 200, bottom: 222 }, menu, viewport))
      .toEqual({ left: 120, top: 226, maxHeight: 280 })
  })
  it('flips above a line near the bottom of the window', () => {
    expect(mentionPosition({ left: 120, top: 700, bottom: 722 }, menu, viewport))
      .toEqual({ left: 120, top: 416, maxHeight: 280 })
  })
  it('keeps sixteen pixels at both horizontal edges', () => {
    expect(mentionPosition({ left: 900, top: 200, bottom: 222 }, menu, viewport).left).toBe(604)
    expect(mentionPosition({ left: -20, top: 200, bottom: 222 }, menu, viewport).left).toBe(16)
    expect(mentionPosition({ left: 300, top: 200, bottom: 222 }, { width: 343, height: 280 }, { width: 375, height: 800 }).left).toBe(16)
  })
  it('limits height to the larger side when neither side fits', () => {
    const small = { width: 1000, height: 400 }
    expect(mentionPosition({ left: 120, top: 220, bottom: 242 }, menu, small))
      .toEqual({ left: 120, top: 16, maxHeight: 200 })
    expect(mentionPosition({ left: 120, top: 100, bottom: 122 }, menu, small))
      .toEqual({ left: 120, top: 126, maxHeight: 258 })
  })
  it('stays below when the menu fits exactly', () => {
    expect(mentionPosition({ left: 120, top: 478, bottom: 500 }, menu, viewport))
      .toEqual({ left: 120, top: 504, maxHeight: 280 })
  })
  it('clamps lines scrolled outside the window', () => {
    expect(mentionPosition({ left: 120, top: -60, bottom: -38 }, menu, viewport))
      .toEqual({ left: 120, top: 16, maxHeight: 280 })
    expect(mentionPosition({ left: 120, top: 1000, bottom: 1022 }, menu, viewport))
      .toEqual({ left: 120, top: 504, maxHeight: 280 })
  })
})

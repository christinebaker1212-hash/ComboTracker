import { describe, expect, it } from 'vitest'
import { InputHistory, buttonTokens, framesBetween } from './history'
import { INPUT_PROFILES, type PadButton } from './input'
import type { Direction } from './tokens'

const frame = (time: number, dir: Direction | null, ...b: PadButton[]) => ({ time, dir, buttons: new Set(b) })

describe('input history', () => {
  it('adds a row per change with frame counts', () => {
    const h = new InputHistory()
    expect(h.update(frame(0, null))).toBe(false) // idle before the first input isn't logged
    h.update(frame(100, 'down'))
    h.update(frame(150, 'downright'))
    h.update(frame(200, 'right', 'RB'))
    expect(h.update(frame(210, 'right', 'RB'))).toBe(false)
    h.update(frame(300, 'right', 'RB', 'X'))
    expect(h.entries.map((e) => [e.dir, e.buttons.join('+'), e.fresh.join('+'), e.frames])).toEqual([
      ['right', 'lp+hp', 'lp', null],
      ['right', 'hp', 'hp', 6],
      ['downright', '', '', 3],
      ['down', '', '', 3],
    ])
    expect(h.framesOf(h.entries[0], 400)).toBe(6)
  })

  it('caps rows and frame counts', () => {
    const h = new InputHistory(3)
    for (let i = 0; i < 10; i++) h.update(frame(i * 100, i % 2 ? 'up' : 'down'))
    expect(h.entries).toHaveLength(3)
    expect(framesBetween(0, 100000)).toBe(99)
  })

  it('names buttons by the icon style mapping', () => {
    expect(buttonTokens(new Set<PadButton>(['A', 'X']))).toEqual(['lp', 'lk'])
    expect(buttonTokens(new Set<PadButton>(['X']), { ...INPUT_PROFILES.Tekken, padMap: [{ buttons: ['X'], emit: 'mp' }] })).toEqual(['mp'])
  })
})

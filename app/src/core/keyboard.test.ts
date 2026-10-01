import { describe, expect, it } from 'vitest'
import { buttonsFromKeys, codeToVk, DEFAULT_KEYMAP, keyLabel, PAD_INDEX, SocdCleaner } from './keyboard'

const { UP, DOWN, LEFT, RIGHT, X } = PAD_INDEX

describe('keyboard play', () => {
  it('maps held keys to pad buttons', () => {
    expect(buttonsFromKeys(['KeyS', 'KeyU', 'KeyZ'], DEFAULT_KEYMAP)).toEqual(new Set([DOWN, X]))
  })

  it('converts key codes to Windows virtual keys', () => {
    expect(codeToVk('KeyW')).toBe(0x57)
    expect(codeToVk('Digit1')).toBe(0x31)
    expect(codeToVk('Numpad4')).toBe(0x64)
    expect(codeToVk('Space')).toBe(0x20)
    expect(codeToVk('Semicolon')).toBe(0xba)
    expect(codeToVk('Nope')).toBeNull()
    expect(keyLabel('KeyW')).toBe('W')
    expect(keyLabel('ArrowUp')).toBe('↑')
  })

  it('cleans SOCD: left+right is neutral, up+down is up', () => {
    const c = new SocdCleaner()
    expect(c.clean(new Set([LEFT, RIGHT, DOWN]), 'neutral')).toEqual(new Set([DOWN]))
    expect(c.clean(new Set([UP, DOWN]), 'neutral')).toEqual(new Set([UP]))
  })

  it('cleans SOCD: last input wins', () => {
    const c = new SocdCleaner()
    c.clean(new Set([LEFT]), 'last')
    expect(c.clean(new Set([LEFT, RIGHT]), 'last')).toEqual(new Set([RIGHT]))
    c.clean(new Set([UP]), 'last')
    expect(c.clean(new Set([UP, DOWN]), 'last')).toEqual(new Set([DOWN]))
  })
})

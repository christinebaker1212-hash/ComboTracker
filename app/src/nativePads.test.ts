import { describe, expect, it } from 'vitest'
import { padStateFromGamepad } from './core/input'
import { padFromSnapshot } from './nativePads'

describe('native pads', () => {
  it('turn into a standard-layout pad the viewer understands', () => {
    // ✕ (A), L1 and D-pad up held, left stick pushed down, R2 fully in.
    const pad = padFromSnapshot({
      index: 110, name: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      vendor: 0x054c, product: 0x0ce6, buttons: 1 << 0 | 1 << 4 | 1 << 12, lt: 0, rt: 255, lx: 0, ly: 32767, rx: 0, ry: 0,
    })
    const state = padStateFromGamepad(pad)
    expect([...state.pressed].sort()).toEqual(['A', 'DPAD_UP', 'LEFT_SHOULDER', 'L_STICK_DOWN', 'RT'])
    expect(state.left).toEqual([0, 1])
  })
})

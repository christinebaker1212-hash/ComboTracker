import { useEffect, useState } from 'react'
import { padStateFromGamepad, type PadState } from '../core/input'
import { onNativePads, pickPad } from '../nativePads'

const IDLE: PadState = { pressed: new Set(), left: [0, 0], right: [0, 0], dir: null }

/**
 * Reads the controller every frame while one is connected. Natively read pads
 * also push their changes, so the display keeps up even if the window isn't
 * being redrawn because another window (the game) has focus.
 */
export function usePadState(padIndex: number | null): PadState {
  const [state, setState] = useState<PadState>(IDLE)
  useEffect(() => {
    let raf = 0
    let last = ''
    const read = () => {
      const pad = pickPad(padIndex)
      const next = pad ? padStateFromGamepad(pad) : IDLE
      // Only re-render when something visible changed.
      const key = `${[...next.pressed].join()}|${next.left.map((v) => v.toFixed(2))}|${next.right.map((v) => v.toFixed(2))}`
      if (key !== last) {
        last = key
        setState(next)
      }
    }
    const loop = () => {
      read()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const off = onNativePads(read)
    return () => {
      cancelAnimationFrame(raf)
      off()
    }
  }, [padIndex])
  return state
}

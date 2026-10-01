import { useEffect, useState } from 'react'
import { padStateFromGamepad, pickPad, type PadState } from '../core/input'

const IDLE: PadState = { pressed: new Set(), left: [0, 0], right: [0, 0], dir: null }

/** Reads the controller every frame while one is connected. */
export function usePadState(padIndex: number | null): PadState {
  const [state, setState] = useState<PadState>(IDLE)
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const pad = pickPad(padIndex)
      const next = pad ? padStateFromGamepad(pad) : IDLE
      // Only re-render when something visible changed.
      const key = `${[...next.pressed].join()}|${next.left.map((v) => v.toFixed(2))}|${next.right.map((v) => v.toFixed(2))}`
      if (key !== last) {
        last = key
        setState(next)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [padIndex])
  return state
}


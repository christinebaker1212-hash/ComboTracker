import { useEffect, useRef, useState } from 'react'
import { insertTokens, mutateLast } from '../core/editor'
import { frameFromGamepad, InputInterpreter, profileFor } from '../core/input'
import { useStore } from '../store/useStore'

/**
 * Reads the first connected controller through the browser Gamepad API and
 * feeds it to the input interpreter. Polls once per animation frame and only
 * while a controller is connected, so an idle app uses no CPU.
 */
export function useGamepad(): string | null {
  const [padName, setPadName] = useState<string | null>(null)
  const interp = useRef(new InputInterpreter())
  const glyphName = useStore((s) => s.glyph.name)

  useEffect(() => {
    interp.current.profile = profileFor(glyphName)
    interp.current.reset()
  }, [glyphName])

  useEffect(() => {
    let raf = 0
    let active = false

    const firstPad = () => navigator.getGamepads?.().find((p): p is Gamepad => !!p && p.connected) ?? null

    const loop = () => {
      const pad = firstPad()
      if (!pad) {
        active = false
        setPadName(null)
        return
      }
      const { edit } = useStore.getState()
      for (const ev of interp.current.update(frameFromGamepad(pad, performance.now()))) {
        if (ev.type === 'insert') edit((s, g) => insertTokens(s, ev.tokens, g))
        else edit((s) => mutateLast(s, ev.from, ev.to))
      }
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      const pad = firstPad()
      setPadName(pad?.id ?? null)
      if (pad && !active) {
        active = true
        interp.current.reset()
        raf = requestAnimationFrame(loop)
      }
    }

    window.addEventListener('gamepadconnected', start)
    window.addEventListener('gamepaddisconnected', start)
    start()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('gamepadconnected', start)
      window.removeEventListener('gamepaddisconnected', start)
    }
  }, [])

  return padName
}

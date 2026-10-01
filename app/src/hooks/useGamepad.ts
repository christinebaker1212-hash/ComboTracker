import { useEffect, useRef, useState } from 'react'
import { insertTokens, mutateLast } from '../core/editor'
import { frameFromGamepad, InputInterpreter, profileFor, profileFromMappings } from '../core/input'
import { inputBus } from '../inputBus'
import { onNativePads, pickPad } from '../nativePads'
import { practiceActive } from '../platform'
import { useStore } from '../store/useStore'

/** Poll interval. Independent of screen redraws, so a slow frame never swallows a quick input. */
const POLL_MS = 4

/**
 * Reads the chosen controller through the browser Gamepad API and turns it
 * into combo input. Polls only while a controller is connected, so an idle
 * app uses no CPU.
 */
export function useGamepad(): string | null {
  const [padName, setPadName] = useState<string | null>(null)
  const interp = useRef(new InputInterpreter())
  const glyph = useStore((s) => s.glyph)
  const padIndex = useStore((s) => s.settings.padIndex)

  useEffect(() => {
    const hasMap = glyph.source === 'user' && glyph.mappings && Object.keys(glyph.mappings).length
    interp.current.profile = hasMap ? profileFromMappings(glyph.mappings!) : profileFor(glyph.name)
    interp.current.reset()
  }, [glyph])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    let active = false

    const loop = () => {
      const pad = pickPad(useStore.getState().settings.padIndex)
      if (!pad) {
        active = false
        clearInterval(timer)
        setPadName(null)
        return
      }
      const now = performance.now()
      const frame = frameFromGamepad(pad, now)
      inputBus.emitRaw(frame.buttons)
      const events = interp.current.update(frame)
      const { edit, settings } = useStore.getState()
      for (const ev of events) {
        inputBus.emit(ev, now)
        if (inputBus.captured || !settings.padInput || practiceActive()) continue
        if (ev.type === 'insert') edit((s, g) => insertTokens(s, ev.tokens, g))
        else edit((s) => mutateLast(s, ev.from, ev.to))
      }
    }

    const start = () => {
      const pad = pickPad(useStore.getState().settings.padIndex)
      setPadName(pad?.id ?? null)
      if (pad && !active) {
        active = true
        interp.current.reset()
        timer = setInterval(loop, POLL_MS)
      }
    }

    window.addEventListener('gamepadconnected', start)
    window.addEventListener('gamepaddisconnected', start)
    window.addEventListener('nativepadschanged', start)
    // Native pads push each change, which keeps input flowing even if timers are slowed down.
    const offNative = onNativePads(() => active && loop())
    start()
    return () => {
      offNative()
      clearInterval(timer)
      active = false
      window.removeEventListener('gamepadconnected', start)
      window.removeEventListener('gamepaddisconnected', start)
      window.removeEventListener('nativepadschanged', start)
    }
  }, [padIndex])

  return padName
}

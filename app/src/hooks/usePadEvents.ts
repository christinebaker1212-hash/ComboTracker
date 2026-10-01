import { useEffect, useRef } from 'react'
import type { GlyphPack } from '../core/glyphs'
import { frameFromGamepad, InputInterpreter, profileFor, profileFromMappings, type InputEvent } from '../core/input'
import { onNativePads, pickPad } from '../nativePads'

/**
 * Runs its own controller interpreter, for windows that aren't the main editor
 * (the practice overlay). Polls on a timer, independent of screen redraws.
 */
export function usePadEvents(padIndex: number | null, glyph: GlyphPack, onEvent: (ev: InputEvent, time: number) => void) {
  const handler = useRef(onEvent)
  useEffect(() => {
    handler.current = onEvent
  })
  const interp = useRef(new InputInterpreter())
  useEffect(() => {
    const hasMap = glyph.source === 'user' && glyph.mappings && Object.keys(glyph.mappings).length
    interp.current.profile = hasMap ? profileFromMappings(glyph.mappings!) : profileFor(glyph.name)
    interp.current.reset()
  }, [glyph])
  useEffect(() => {
    const tick = () => {
      const pad = pickPad(padIndex)
      if (!pad) return
      const now = performance.now()
      for (const ev of interp.current.update(frameFromGamepad(pad, now))) handler.current(ev, now)
    }
    const timer = setInterval(tick, 4)
    // Native pads push each change, which keeps input flowing even if timers are slowed down.
    const off = onNativePads(tick)
    return () => {
      clearInterval(timer)
      off()
    }
  }, [padIndex])
}

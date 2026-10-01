import { useEffect, useState } from 'react'
import type { GlyphPack } from '../core/glyphs'
import { InputHistory, MAX_FRAMES, type HistoryEntry } from '../core/history'
import { frameFromGamepad, profileFor, profileFromMappings } from '../core/input'
import { onNativePads, pickPad } from '../nativePads'

export type HistoryRow = HistoryEntry & { shown: number }

/**
 * Keeps a training-mode style history of the controller. Reads the pad on a
 * fast timer (and on every native change), redraws at most once per frame.
 */
export function useInputHistory(padIndex: number | null, glyph: GlyphPack, rows = 20): HistoryRow[] {
  const [view, setView] = useState<HistoryRow[]>([])
  useEffect(() => {
    const history = new InputHistory(rows)
    const hasMap = glyph.source === 'user' && glyph.mappings && Object.keys(glyph.mappings).length
    const profile = hasMap ? profileFromMappings(glyph.mappings!) : profileFor(glyph.name)
    let pending = false
    let lastFrames = -1
    const draw = () => {
      if (!pending) return
      pending = false
      const now = performance.now()
      setView(history.entries.map((e) => ({ ...e, shown: history.framesOf(e, now) })))
    }
    const redraw = () => {
      if (pending) return
      pending = true
      requestAnimationFrame(draw)
      // Animation frames can stall in a background window; make sure it still draws.
      setTimeout(draw, 50)
    }
    const read = () => {
      const pad = pickPad(padIndex)
      if (!pad) return
      const now = performance.now()
      const added = history.update(frameFromGamepad(pad, now), profile)
      const newest = history.entries[0]
      const frames = newest ? history.framesOf(newest, now) : -1
      if (added || (frames !== lastFrames && frames <= MAX_FRAMES)) {
        lastFrames = frames
        redraw()
      }
    }
    const timer = setInterval(read, 4)
    const off = onNativePads(read)
    return () => {
      clearInterval(timer)
      off()
    }
  }, [padIndex, glyph, rows])
  return view
}


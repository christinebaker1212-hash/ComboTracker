import { useEffect } from 'react'
import { FAMILIES, PAD_GLYPHS, padFamily } from '../core/controllers'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import type { PadLike } from '../core/input'
import { connectedPads } from '../nativePads'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'

const ASKED_KEY = 'combotracker:pad-asked'

function asked(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ASKED_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** Applies the icon style and input viewer layout that suit a kind of controller. */
export function applyPadFamily(family: keyof typeof FAMILIES) {
  const s = useStore.getState()
  const info = FAMILIES[family]
  const glyph = BUILTIN_GLYPHS.find((g) => g.name === info.glyph)
  if (glyph && PAD_GLYPHS.has(s.glyph.name)) s.setGlyph(glyph)
  s.setSettings({ viewerLayout: info.layout, ...(family === 'keyboard' ? { keyboard: { ...s.settings.keyboard, enabled: true } } : {}) })
}

/**
 * When a new kind of controller connects, offers once to switch the button
 * icons and input viewer to match it. Never overrides a game-specific icon style.
 */
export function usePadSuggest() {
  useEffect(() => {
    const check = (pad: PadLike | null) => {
      if (!pad || useUI.getState().dialog?.kind === 'setup') return
      const family = padFamily(pad.id)
      if (family === 'generic' || family === 'keyboard') return
      const seen = asked()
      if (seen.includes(pad.id)) return
      try {
        localStorage.setItem(ASKED_KEY, JSON.stringify([...seen, pad.id].slice(-20)))
      } catch {
        // Worst case we ask again next time.
      }
      const s = useStore.getState()
      const info = FAMILIES[family]
      const glyphFits = !PAD_GLYPHS.has(s.glyph.name) || s.glyph.name === info.glyph || info.glyph === 'Default'
      if (glyphFits && s.settings.viewerLayout === info.layout) return
      s.notify(
        glyphFits ? `${info.label} connected. Show it in the input viewer?` : `${info.label} connected. Use ${info.glyph} button icons?`,
        'info',
        { label: glyphFits ? 'Yes' : 'Use them', run: () => applyPadFamily(family) },
      )
    }
    // Goes through the merged list so a pad read both natively and by the browser is offered once.
    const checkAll = () => connectedPads().forEach(check)
    window.addEventListener('gamepadconnected', checkAll)
    window.addEventListener('nativepadschanged', checkAll)
    // Pads already connected show up on first button press in most browsers.
    checkAll()
    return () => {
      window.removeEventListener('gamepadconnected', checkAll)
      window.removeEventListener('nativepadschanged', checkAll)
    }
  }, [])
}

import { useEffect } from 'react'
import { FAMILIES, PAD_GLYPHS, padFamily } from '../core/controllers'
import { BUILTIN_GLYPHS } from '../core/glyphs'
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
  s.setSettings({ viewerLayout: info.layout })
}

/**
 * When a new kind of controller connects, offers once to switch the button
 * icons and input viewer to match it. Never overrides a game-specific icon style.
 */
export function usePadSuggest() {
  useEffect(() => {
    const check = (pad: Gamepad | null) => {
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
    const onConnect = (e: GamepadEvent) => check(e.gamepad)
    window.addEventListener('gamepadconnected', onConnect)
    // Pads already connected show up on first button press in most browsers.
    for (const p of navigator.getGamepads?.() ?? []) check(p)
    return () => window.removeEventListener('gamepadconnected', onConnect)
  }, [])
}

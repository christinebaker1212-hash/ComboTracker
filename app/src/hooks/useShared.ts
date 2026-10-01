// The main window's saved state, for the separate overlay and viewer windows.
import { useEffect, useState } from 'react'
import type { Combo } from '../core/combos'
import { upgradeTheme, type Theme } from '../core/theme'
import { DEFAULT_KEYBOARD } from '../core/keyboard'
import { setKeyboardConfig } from '../nativePads'
import { isObs, obsGlyph } from '../obs'
import { onStateChanged } from '../platform'
import { allGlyphs, useLibrary } from '../store/useLibrary'
import { DEFAULT_SETTINGS, STORAGE_EVENT_KEY, type Player, type Settings } from '../store/useStore'

interface Shared {
  lists: Record<Player, Combo[]>
  glyphName: string
  theme: Theme
  settings: Settings
}

function readShared(): Shared {
  let d: Record<string, unknown> = {}
  try {
    d = JSON.parse(localStorage.getItem(STORAGE_EVENT_KEY) ?? '{}')
  } catch {
    // Fall through to defaults.
  }
  return {
    lists: (d.lists as Shared['lists']) ?? { P1: [], P2: [] },
    glyphName: (d.glyph as string) ?? 'Default',
    theme: upgradeTheme(d.theme as Theme | undefined),
    settings: { ...DEFAULT_SETTINGS, ...(d.settings as Partial<Settings>) },
  }
}

/** The main window's saved state, kept live as it changes. */
export function useShared() {
  const [shared, setShared] = useState(readShared)
  const userGlyphs = useLibrary((s) => s.userGlyphs)
  const refreshLib = useLibrary((s) => s.refresh)
  useEffect(() => {
    const refresh = () => setShared(readShared())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_EVENT_KEY) refresh()
      if (e.key?.startsWith('combotracker:user:')) void refreshLib()
    }
    window.addEventListener('storage', onStorage)
    // Stream pages (OBS) get the state over the server instead.
    window.addEventListener('ct-state', refresh)
    const un = onStateChanged(() => {
      refresh()
      void refreshLib('glyphs')
    })
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('ct-state', refresh)
      un()
    }
  }, [refreshLib])
  const keyboard = shared.settings.keyboard ?? DEFAULT_KEYBOARD
  useEffect(() => setKeyboardConfig(keyboard), [keyboard])
  const glyphs = allGlyphs(userGlyphs)
  const sent = isObs ? obsGlyph() : null
  const glyph = sent?.name === shared.glyphName ? sent : glyphs.find((g) => g.name === shared.glyphName) ?? glyphs[0]
  return { ...shared, glyph }
}


import { parseComboFile, toComboFile } from './core/combos'
import { BUILTIN_GLYPHS } from './core/glyphs'
import { useStore } from './store/useStore'

export function useLoadCombos() {
  const replaceList = useStore((s) => s.replaceList)
  const setGlyph = useStore((s) => s.setGlyph)
  const notify = useStore((s) => s.notify)
  return (json: unknown, label: string) => {
    try {
      const parsed = parseComboFile(json)
      const glyph = BUILTIN_GLYPHS.find((g) => g.name === parsed.glyph)
      if (glyph) setGlyph(glyph)
      replaceList(parsed.combos)
      notify(
        `Loaded ${label} · ${parsed.combos.length} combos${parsed.truncated ? ' (trimmed to 250)' : ''} · Ctrl+Z to undo`,
      )
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }
}

/** Downloads the current player's combos in the desktop app's file format. */
export function exportCurrentList() {
  const s = useStore.getState()
  const blob = new Blob([JSON.stringify(toComboFile(s.lists[s.player], s.glyph.name), null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `combos-${s.player}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

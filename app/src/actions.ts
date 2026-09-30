import { parseComboFile, toComboFile } from './core/combos'
import { BUILTIN_GLYPHS } from './core/glyphs'
import { isDesktop, saveTextFile } from './platform'
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

/** Saves the current player's combos in the original app's file format. */
export async function exportCurrentList() {
  const s = useStore.getState()
  const text = JSON.stringify(toComboFile(s.lists[s.player], s.glyph.name), null, 2)
  try {
    const path = await saveTextFile(`combos-${s.player}.json`, text)
    if (path && isDesktop) s.notify(`Saved ${path}`)
  } catch (e) {
    s.notify(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`, 'error')
  }
}

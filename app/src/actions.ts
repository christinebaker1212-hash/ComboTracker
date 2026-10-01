// Actions shared by menus, shortcuts and dialogs.
import { presetName } from './assets'
import { makeCombo, parseComboFile, toComboFile } from './core/combos'
import { packFromFile, packToFile, type GlyphPackFile } from './core/glyphs'
import { parseLayout } from './core/layouts'
import { compileTheme, type ThemeFile } from './core/theme'
import { isDesktop, saveTextFile } from './platform'
import { allGlyphs, presetRef, readPreset, splitRef, useLibrary } from './store/useLibrary'
import { useStore } from './store/useStore'
import { safeName, writeUser } from './userdata'
import { pickFile } from './files'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Replaces the current player's list with a combo file's contents. */
export function loadCombos(json: unknown, label: string) {
  const s = useStore.getState()
  try {
    const parsed = parseComboFile(json)
    const glyph = allGlyphs(useLibrary.getState().userGlyphs).find((g) => g.name === parsed.glyph)
    if (glyph) s.setGlyph(glyph)
    s.replaceList(parsed.combos)
    s.notifyUndo(`Loaded ${label} · ${parsed.combos.length} combos${parsed.truncated ? ' (trimmed to 250)' : ''}`)
  } catch (e) {
    s.notify(errText(e), 'error')
  }
}

export async function loadPreset(kind: 'combos' | 'commandLists', ref: string) {
  try {
    loadCombos(await readPreset(kind, ref), presetName(splitRef(ref).path))
  } catch (e) {
    useStore.getState().notify(errText(e), 'error')
  }
}

export async function loadThemeRef(ref: string) {
  const s = useStore.getState()
  try {
    s.setTheme(compileTheme(presetName(splitRef(ref).path), (await readPreset('themes', ref)) as ThemeFile), ref)
  } catch (e) {
    s.notify(errText(e), 'error')
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
    s.notify(`Couldn't save: ${errText(e)}`, 'error')
  }
}

export async function exportCombo(id: string) {
  const s = useStore.getState()
  const c = s.lists[s.player].find((x) => x.id === id)
  if (!c) return
  try {
    await saveTextFile(`${safeName(c.name || 'combo')}.json`, JSON.stringify({ name: c.name, tokens: c.tokens }, null, 2))
  } catch (e) {
    s.notify(`Couldn't save: ${errText(e)}`, 'error')
  }
}

/** Loads a single-combo (or list) file into one existing row. */
export async function importIntoCombo(id: string) {
  const s = useStore.getState()
  const file = await pickFile('.json,application/json')
  if (!file) return
  try {
    const parsed = parseComboFile(JSON.parse(await file.text()))
    const first = parsed.combos[0] ?? makeCombo()
    s.updateCombo(id, { name: first.name, tokens: first.tokens })
    s.notifyUndo(`Loaded "${first.name}" into this row`)
  } catch (e) {
    s.notify(`${file.name}: ${errText(e)}`, 'error')
  }
}

/**
 * Opens any ComboTracker file and works out what it is: a combo list, a
 * theme, an icon style or a controller layout. Themes, styles and layouts are
 * also added to the user's library so they stay in the menus.
 */
export async function openAnyFile() {
  const file = await pickFile('.json,application/json')
  if (file) await openFile(file)
}

/** Opens one file the user picked or dropped onto the window. */
export async function openFile(file: File) {
  const s = useStore.getState()
  const lib = useLibrary.getState()
  if (!/\.json$/i.test(file.name)) {
    s.notify(`${file.name} isn't a ComboTracker file (they end in .json).`, 'error')
    return
  }
  const base = file.name.replace(/\.json$/i, '')
  let json: Record<string, unknown>
  try {
    json = JSON.parse(await file.text())
  } catch {
    s.notify(`${file.name} isn't a ComboTracker file.`, 'error')
    return
  }
  try {
    if (Array.isArray(json.slots) || Array.isArray(json.tokens)) {
      loadCombos(json, base)
    } else if (Array.isArray(json.elements)) {
      const layout = parseLayout(json, base)
      const path = `${safeName(layout.name)}.json`
      await writeUser('layouts', path, layout)
      await lib.refresh('layouts')
      s.setSettings({ viewerLayout: presetRef('user', path) })
      s.notify(`Added controller layout "${layout.name}" and set it for the input viewer.`)
    } else if (json.tokens && typeof json.tokens === 'object' || json.mappings) {
      const pack = packFromFile({ ...(json as unknown as GlyphPackFile), name: (json.name as string) || base })
      await writeUser('glyphs', `${safeName(pack.name)}.json`, packToFile(pack))
      await lib.refresh('glyphs')
      s.setGlyph(pack)
      s.notify(`Added icon style "${pack.name}".`)
    } else if (json.bg || json.bg_grad) {
      const path = `${safeName(base)}.json`
      await writeUser('themes', path, json)
      await lib.refresh('themes')
      s.setTheme(compileTheme(base, json as ThemeFile), presetRef('user', path))
      s.notify(`Added theme "${base}".`)
    } else {
      s.notify(`${file.name} isn't a combo list, theme, icon style or layout.`, 'error')
    }
  } catch (e) {
    s.notify(`${file.name}: ${errText(e)}`, 'error')
  }
}

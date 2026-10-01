import { create } from 'zustand'
import { emptyList, makeCombo, MAX_SLOTS, type Combo } from '../core/combos'
import type { EditState } from '../core/editor'
import { BUILTIN_GLYPHS, type GlyphPack } from '../core/glyphs'
import { DEFAULT_KEYBOARD, type KeyboardSettings } from '../core/keyboard'
import { upgradeTheme, type Theme } from '../core/theme'
import { broadcastState } from '../platform'

export type Player = 'P1' | 'P2'
export const PLAYERS: Player[] = ['P1', 'P2']

type Lists = Record<Player, Combo[]>

export interface Caret {
  player: Player
  id: string
  pos: number
}

interface Snapshot {
  lists: Lists
  caret: Caret | null
}

export interface State {
  lists: Lists
  player: Player
  /** Selected combo per player (the one input goes into). */
  selected: Record<Player, string>
  caret: Caret | null
  glyph: GlyphPack
  theme: Theme
  themePath: string
  pinScale: number
  past: Snapshot[]
  future: Snapshot[]
  toast: Toast | null
  settings: Settings

  setPlayer(p: Player): void
  select(id: string): void
  setCaret(id: string, pos: number | null): void
  /** Applies an editing rule to the selected combo, recording undo history. */
  edit(fn: (s: EditState, g: GlyphPack) => EditState): void
  updateCombo(id: string, patch: Partial<Omit<Combo, 'id'>>, record?: boolean): void
  addCombo(afterId?: string): void
  duplicateCombo(id: string): void
  removeCombo(id: string): void
  moveCombo(id: string, toIndex: number): void
  clearCombo(id: string): void
  clearAll(): void
  replaceList(combos: Combo[], player?: Player): void
  appendList(combos: Combo[], player?: Player): void
  setAllPinned(pinned: boolean): void
  setGlyph(g: GlyphPack): void
  setTheme(t: Theme, path: string): void
  setPinScale(n: number): void
  setSettings(patch: Partial<Settings>): void
  undo(): void
  redo(): void
  notify(text: string, tone?: 'info' | 'error', action?: ToastAction): void
  /** Toast with an Undo button for anything destructive. */
  notifyUndo(text: string): void
}

export interface ToastAction { label: string; run: () => void }
export interface Toast { text: string; tone: 'info' | 'error'; action?: ToastAction; id: number }
let toastId = 0

export interface Settings {
  /** One overlay window with every pinned combo, or one window per combo. */
  overlayMode: 'combined' | 'separate'
  /** Which controller drives input; null picks the first one connected. */
  padIndex: number | null
  /** Controller input on/off, e.g. to stop a pad left on the desk typing into combos. */
  padInput: boolean
  /** Layout shown by the input viewer (a preset ref). */
  viewerLayout: string | null
  /** Global hotkeys (desktop): overlay, lock, practice restart, scenes. */
  hotkeys: boolean
  /** Interface size: tighter rows, or bigger click targets. */
  uiSize: 'compact' | 'standard' | 'large'
  /** Show one-time tips next to features the first time they appear. */
  tips: boolean
  /** Keys that stand in for controller buttons (keyboard players, leverless in keyboard mode). */
  keyboard: KeyboardSettings
  /** Show a combo's frame data (from the move list) under it on the overlay. */
  overlayFrames: boolean
  /** Stream links: a local server OBS can load the overlay, viewer and history from (desktop). */
  obs: { enabled: boolean; port: number }
}

export const DEFAULT_SETTINGS: Settings = {
  overlayMode: 'combined',
  padIndex: null,
  padInput: true,
  viewerLayout: 'builtin:Gamepad/Xbox One.json',
  hotkeys: true,
  uiSize: 'standard',
  tips: true,
  keyboard: DEFAULT_KEYBOARD,
  obs: { enabled: false, port: 7777 },
  overlayFrames: false,
}

const STORAGE_KEY = 'combotracker:v1'
const HISTORY_LIMIT = 200

interface Saved {
  lists: Lists
  glyph: string
  themePath: string
  theme: Theme
  pinScale: number
  settings: Settings
}

function loadSaved(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {}
  } catch {
    return {}
  }
}

export function readSavedLists(): Lists | null {
  return loadSaved().lists ?? null
}

export const STORAGE_EVENT_KEY = STORAGE_KEY
/** Glyph pack name from the last session (may be a user pack that loads later). */
export const savedGlyphName = () => loadSaved().glyph ?? 'Default'

const saved = loadSaved()
const initialLists: Lists = {
  P1: saved.lists?.P1?.length ? saved.lists.P1 : emptyList(),
  P2: saved.lists?.P2?.length ? saved.lists.P2 : emptyList(),
}

export const useStore = create<State>()((set, get) => {
  /** Records the current lists for undo, then applies the change. */
  const commit = (fn: (s: State) => Partial<State>) =>
    set((s) => ({
      ...fn(s),
      past: [...s.past, { lists: s.lists, caret: s.caret }].slice(-HISTORY_LIMIT),
      future: [],
    }))

  const withList = (s: State, p: Player, list: Combo[]): Lists => ({ ...s.lists, [p]: list })

  const ensureSelection = (list: Combo[], id: string) =>
    list.some((c) => c.id === id) ? id : (list[0]?.id ?? '')

  return {
    lists: initialLists,
    player: 'P1',
    selected: { P1: initialLists.P1[0].id, P2: initialLists.P2[0].id },
    caret: null,
    glyph: BUILTIN_GLYPHS.find((g) => g.name === saved.glyph) ?? BUILTIN_GLYPHS[0],
    theme: upgradeTheme(saved.theme),
    themePath: saved.themePath ?? '',
    pinScale: saved.pinScale ?? 1,
    past: [],
    future: [],
    toast: null,
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },

    setPlayer: (player) => set({ player, caret: null }),

    select: (id) =>
      set((s) => ({
        selected: { ...s.selected, [s.player]: id },
        caret: s.caret?.id === id ? s.caret : null,
      })),

    setCaret: (id, pos) =>
      set((s) => ({
        selected: { ...s.selected, [s.player]: id },
        caret: pos === null ? null : { player: s.player, id, pos },
      })),

    edit: (fn) => {
      const s = get()
      const p = s.player
      const id = s.selected[p]
      const combo = s.lists[p].find((c) => c.id === id)
      if (!combo) return
      const hasCaret = s.caret?.player === p && s.caret.id === id
      const next = fn({ tokens: combo.tokens, cursor: hasCaret ? s.caret!.pos : null }, s.glyph)
      const changed = next.tokens !== combo.tokens && next.tokens.join() !== combo.tokens.join()
      const caret = next.cursor === null ? (hasCaret ? null : s.caret) : { player: p, id, pos: next.cursor }
      if (!changed) {
        set({ caret })
        return
      }
      commit((s) => ({
        lists: withList(s, p, s.lists[p].map((c) => (c.id === id ? { ...c, tokens: next.tokens } : c))),
        caret,
      }))
    },

    updateCombo: (id, patch, record = true) => {
      const apply = (s: State) => ({
        lists: withList(s, s.player, s.lists[s.player].map((c) => (c.id === id ? { ...c, ...patch } : c))),
      })
      if (record) commit(apply)
      else set(apply)
    },

    addCombo: (afterId) =>
      commit((s) => {
        const list = s.lists[s.player]
        if (list.length >= MAX_SLOTS) return {}
        const c = makeCombo(`Combo ${list.length + 1}`)
        const at = afterId ? list.findIndex((x) => x.id === afterId) + 1 : list.length
        const next = [...list.slice(0, at), c, ...list.slice(at)]
        return { lists: withList(s, s.player, next), selected: { ...s.selected, [s.player]: c.id } }
      }),

    duplicateCombo: (id) =>
      commit((s) => {
        const list = s.lists[s.player]
        const i = list.findIndex((c) => c.id === id)
        if (i < 0 || list.length >= MAX_SLOTS) return {}
        const copy = { ...makeCombo(`${list[i].name} (copy)`, list[i].tokens), child: list[i].child }
        const next = [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]
        return { lists: withList(s, s.player, next), selected: { ...s.selected, [s.player]: copy.id } }
      }),

    removeCombo: (id) => {
      const name = get().lists[get().player].find((c) => c.id === id)?.name
      commit((s) => {
        let next = s.lists[s.player].filter((c) => c.id !== id)
        if (!next.length) next = emptyList(1)
        return {
          lists: withList(s, s.player, next),
          selected: { ...s.selected, [s.player]: ensureSelection(next, s.selected[s.player]) },
          caret: s.caret?.id === id ? null : s.caret,
        }
      })
      get().notifyUndo(`Deleted “${name || 'combo'}”`)
    },

    moveCombo: (id, toIndex) =>
      commit((s) => {
        const list = [...s.lists[s.player]]
        const from = list.findIndex((c) => c.id === id)
        if (from < 0) return {}
        const [c] = list.splice(from, 1)
        list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, c)
        return { lists: withList(s, s.player, list) }
      }),

    clearCombo: (id) => {
      if (!get().lists[get().player].find((c) => c.id === id)?.tokens.length) return
      commit((s) => ({
        lists: withList(s, s.player, s.lists[s.player].map((c) => (c.id === id ? { ...c, tokens: [] } : c))),
        caret: s.caret?.id === id ? null : s.caret,
      }))
      get().notifyUndo('Cleared the combo')
    },

    clearAll: () => {
      commit((s) => {
        const next = emptyList(s.lists[s.player].length)
        return { lists: withList(s, s.player, next), selected: { ...s.selected, [s.player]: next[0].id }, caret: null }
      })
      get().notifyUndo('Cleared every combo')
    },

    replaceList: (combos, player) =>
      commit((s) => {
        const p = player ?? s.player
        const next = combos.length ? combos : emptyList(1)
        return { lists: withList(s, p, next), selected: { ...s.selected, [p]: next[0].id }, caret: null }
      }),

    appendList: (combos, player) =>
      commit((s) => {
        const p = player ?? s.player
        const next = [...s.lists[p], ...combos].slice(0, MAX_SLOTS)
        return { lists: withList(s, p, next) }
      }),

    setAllPinned: (pinned) =>
      commit((s) => ({ lists: withList(s, s.player, s.lists[s.player].map((c) => ({ ...c, pinned }))) })),

    setGlyph: (glyph) => set({ glyph }),
    setTheme: (theme, themePath) => set({ theme, themePath }),
    setPinScale: (pinScale) => set({ pinScale }),
    setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

    undo: () =>
      set((s) => {
        const prev = s.past.at(-1)
        if (!prev) return {}
        return {
          lists: prev.lists,
          caret: prev.caret,
          past: s.past.slice(0, -1),
          future: [{ lists: s.lists, caret: s.caret }, ...s.future],
          selected: {
            P1: ensureSelection(prev.lists.P1, s.selected.P1),
            P2: ensureSelection(prev.lists.P2, s.selected.P2),
          },
        }
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0]
        if (!next) return {}
        return {
          lists: next.lists,
          caret: next.caret,
          future: s.future.slice(1),
          past: [...s.past, { lists: s.lists, caret: s.caret }],
          selected: {
            P1: ensureSelection(next.lists.P1, s.selected.P1),
            P2: ensureSelection(next.lists.P2, s.selected.P2),
          },
        }
      }),

    notify: (text, tone = 'info', action) => set({ toast: { text, tone, action, id: ++toastId } }),
    notifyUndo: (text) => get().notify(text, 'info', { label: 'Undo', run: () => get().undo() }),
  }
})

// Autosave: debounced so rapid gamepad input doesn't hammer storage.
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.lists === prev.lists && s.glyph === prev.glyph && s.theme === prev.theme && s.pinScale === prev.pinScale && s.settings === prev.settings) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data: Saved = {
      lists: s.lists, glyph: s.glyph.name, themePath: s.themePath, theme: s.theme, pinScale: s.pinScale,
      settings: s.settings,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      broadcastState()
    } catch {
      // Storage full or blocked (private mode): the session still works, it just won't persist.
    }
  }, 150)
})

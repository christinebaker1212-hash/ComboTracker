// Overlay windows as a whole: show/hide, lock, and saved scenes (which
// windows are open and where). Shared by the top bar and the global hotkeys.
import { create } from 'zustand'
import {
  closeFloating, isFloatingOpen, openFloating, openFloatingWindows, openOverlay, openViewer,
  overlaysLocked, setOverlaysLocked, VIEWER_LABEL, HISTORY_LABEL, openHistory, type FloatingInfo,
} from './platform'
import { useStore } from './store/useStore'

// --- Lock (click-through) ---
interface LockState { locked: boolean; toggle(): void }

export const useLock = create<LockState>()((set, get) => {
  // Overlays start unlocked each session, so nobody gets stuck with a window they can't move.
  if (overlaysLocked()) setOverlaysLocked(false)
  return {
    locked: false,
    toggle: () => {
      const locked = !get().locked
      setOverlaysLocked(locked)
      set({ locked })
      useStore.getState().notify(locked ? 'Overlays locked: clicks pass through to your game.' : 'Overlays unlocked: drag to move, scroll to resize.')
    },
  }
})

// --- Show / hide ---
export async function showOverlay() {
  const s = useStore.getState()
  if (s.settings.overlayMode === 'separate') {
    const pinned = s.lists[s.player].filter((c) => c.pinned)
    if (!pinned.length) {
      s.notify('Pin some combos first (📌 on each row). Each one opens in its own window.')
      return
    }
    for (const c of pinned) await openOverlay(s.player, c.id)
    return
  }
  if (!(await openOverlay(s.player))) s.notify('Your browser blocked the overlay window. Allow pop-ups for this page.', 'error')
}

/** Hides the combo overlays if any are open, otherwise shows them. */
export async function toggleOverlay() {
  const overlays = (await openFloatingWindows()).filter((w) => w.label.startsWith('overlay-') && !w.label.startsWith('overlay-practice'))
  if (overlays.length) await Promise.all(overlays.map((w) => closeFloating(w.label)))
  else await showOverlay()
}

export async function toggleViewer() {
  if (await isFloatingOpen(VIEWER_LABEL)) await closeFloating(VIEWER_LABEL)
  else await openViewer()
}

export async function toggleHistory() {
  if (await isFloatingOpen(HISTORY_LABEL)) await closeFloating(HISTORY_LABEL)
  else await openHistory()
}

// --- Scenes ---
export interface Scene {
  name: string
  windows: FloatingInfo[]
  /** Size/backdrop settings of each window, keyed by their storage key. */
  prefs: Record<string, string>
}

const SCENES_KEY = 'combotracker:scenes'

function loadScenes(): Scene[] {
  try {
    const v = JSON.parse(localStorage.getItem(SCENES_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Where each floating window keeps its size and backdrop (see FloatingShell). */
function prefKeyFor(w: FloatingInfo): string | null {
  const q = new URLSearchParams(w.query)
  const view = q.get('view')
  const p = q.get('p') ?? 'P1'
  if (view === 'viewer') return 'combotracker:viewer'
  if (view === 'history') return 'combotracker:history'
  if (view === 'practice') return `combotracker:practice:${p}`
  if (view === 'overlay') return `combotracker:overlay:${p}${q.get('combo') ? `:${q.get('combo')}` : ''}`
  return null
}

interface ScenesState {
  scenes: Scene[]
  save(name: string): Promise<Scene | null>
  apply(name: string): Promise<void>
  remove(name: string): void
  rename(from: string, to: string): void
}

export const useScenes = create<ScenesState>()((set, get) => {
  const persist = (scenes: Scene[]) => {
    set({ scenes })
    try {
      localStorage.setItem(SCENES_KEY, JSON.stringify(scenes))
    } catch {
      // Scenes just won't survive a restart.
    }
  }
  return {
    scenes: loadScenes(),
    save: async (name) => {
      const windows = await openFloatingWindows()
      if (!windows.length) {
        useStore.getState().notify('Open the overlay or input viewer first, place them where you want, then save the scene.')
        return null
      }
      const prefs: Record<string, string> = {}
      for (const w of windows) {
        const k = prefKeyFor(w)
        const v = k && localStorage.getItem(k)
        if (k && v) prefs[k] = v
      }
      const scene: Scene = { name: name.trim() || `Scene ${get().scenes.length + 1}`, windows, prefs }
      persist([...get().scenes.filter((s) => s.name !== scene.name), scene])
      return scene
    },
    apply: async (name) => {
      const scene = get().scenes.find((s) => s.name === name)
      if (!scene) return
      const s = useStore.getState()
      // Skip single-combo windows whose combo no longer exists.
      const wanted = scene.windows.filter((w) => {
        const q = new URLSearchParams(w.query)
        const id = q.get('combo')
        const p = q.get('p') === 'P2' ? 'P2' : 'P1'
        return !id || s.lists[p].some((c) => c.id === id)
      })
      const labels = new Set(wanted.map((w) => w.label))
      for (const w of await openFloatingWindows()) if (!labels.has(w.label)) await closeFloating(w.label)
      for (const [k, v] of Object.entries(scene.prefs)) localStorage.setItem(k, v)
      for (const w of wanted) {
        // Reopen so each window picks up the scene's size and backdrop.
        if (await isFloatingOpen(w.label)) await closeFloating(w.label)
        await openFloating(w.label, w.query, w.title, w.size, w.pos)
      }
      s.notify(`Scene “${scene.name}”: ${wanted.length} window${wanted.length === 1 ? '' : 's'}.`)
    },
    remove: (name) => {
      const before = get().scenes
      persist(before.filter((s) => s.name !== name))
      useStore.getState().notify(`Deleted scene “${name}”`, 'info', { label: 'Undo', run: () => persist(before) })
    },
    rename: (from, to) => {
      const name = to.trim()
      if (!name || get().scenes.some((s) => s.name === name)) return
      persist(get().scenes.map((s) => (s.name === from ? { ...s, name } : s)))
    },
  }
})


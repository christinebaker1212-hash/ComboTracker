// Differences between running in a browser and in the Tauri desktop app.
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { Player } from './store/useStore'

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const overlayLabel = (p: Player, comboId?: string) => (comboId ? `overlay-${p}-${comboId}` : `overlay-${p}`)

/** Opens (or focuses) a see-through, always-on-top window for a page of this app. */
async function openFloating(label: string, query: string, title: string, size: { width: number; height: number }): Promise<boolean> {
  if (!isDesktop) {
    const w = window.open(`${location.pathname}?${query}`, label, `width=${size.width},height=${size.height}`)
    return !!w
  }
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return true
  }
  new WebviewWindow(label, {
    url: `index.html?${query}`,
    title,
    ...size,
    transparent: true,
    decorations: false,
    shadow: false,
    alwaysOnTop: true,
    resizable: true,
  })
  return true
}

async function closeFloating(label: string) {
  if (!isDesktop) {
    window.open('', label)?.close()
    return
  }
  await (await WebviewWindow.getByLabel(label))?.close()
}

/** Opens (or focuses) the pinned-combo overlay: all pinned combos, or a single one. */
export function openOverlay(p: Player, comboId?: string): Promise<boolean> {
  const q = `view=overlay&p=${p}${comboId ? `&combo=${comboId}` : ''}`
  return openFloating(overlayLabel(p, comboId), q, `ComboTracker overlay · Player ${p[1]}`, { width: 560, height: 240 })
}

export const closeOverlay = (p: Player, comboId?: string) => closeFloating(overlayLabel(p, comboId))

/** Opens the live input viewer. */
export const openViewer = () => openFloating('viewer-main', 'view=viewer', 'ComboTracker input viewer', { width: 420, height: 280 })

/** Tells overlays that the saved state changed (browser windows get a storage event instead). */
export function broadcastState() {
  if (isDesktop) void emit('state-changed')
}

export function onStateChanged(fn: () => void): () => void {
  if (!isDesktop) return () => {}
  const un = listen('state-changed', fn)
  return () => void un.then((f) => f())
}

const LOCK_KEY = 'combotracker:overlays-locked'

/** Click-through for every floating window: while locked, clicks pass through to the game. */
export function setOverlaysLocked(locked: boolean) {
  try {
    localStorage.setItem(LOCK_KEY, locked ? '1' : '')
  } catch {
    // Lock still applies to open windows via the event below.
  }
  if (isDesktop) void emit('overlay-lock', { locked })
}

export function overlaysLocked(): boolean {
  try {
    return !!localStorage.getItem(LOCK_KEY)
  } catch {
    return false
  }
}

export function onOverlayLock(fn: (locked: boolean) => void): () => void {
  if (!isDesktop) return () => {}
  const un = listen<{ locked: boolean }>('overlay-lock', (e) => fn(e.payload.locked))
  return () => void un.then((f) => f())
}

export async function applyClickThrough(locked: boolean) {
  if (isDesktop) await getCurrentWindow().setIgnoreCursorEvents(locked)
}

export function startWindowDrag() {
  if (isDesktop) void getCurrentWindow().startDragging()
}

export async function fitWindow(width: number, height: number) {
  if (isDesktop) await getCurrentWindow().setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)))
}

export async function closeWindow() {
  if (isDesktop) await getCurrentWindow().close()
  else window.close()
}

/** Saves text via the native Save dialog on desktop, or a download in the browser. */
export async function saveTextFile(defaultName: string, text: string): Promise<string | null> {
  if (isDesktop) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: defaultName, filters: [{ name: 'Combo list', extensions: ['json'] }] })
    if (!path) return null
    await writeTextFile(path, text)
    return path
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = defaultName
  a.click()
  URL.revokeObjectURL(a.href)
  return defaultName
}

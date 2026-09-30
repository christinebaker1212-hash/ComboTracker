// Differences between running in a browser and in the Tauri desktop app.
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { Player } from './store/useStore'

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const overlayLabel = (p: Player) => `overlay-${p}`

/** Opens (or focuses) the pinned-combo overlay for a player. */
export async function openOverlay(p: Player): Promise<boolean> {
  const url = `index.html?view=overlay&p=${p}`
  if (!isDesktop) return !!window.open(`${location.pathname}?view=overlay&p=${p}`, overlayLabel(p), 'width=720,height=420')
  const existing = await WebviewWindow.getByLabel(overlayLabel(p))
  if (existing) {
    await existing.setFocus()
    return true
  }
  new WebviewWindow(overlayLabel(p), {
    url,
    title: `ComboTracker overlay · Player ${p[1]}`,
    width: 560,
    height: 240,
    transparent: true,
    decorations: false,
    shadow: false,
    alwaysOnTop: true,
    resizable: true,
  })
  return true
}

/** Tells overlays that the saved state changed (browser windows get a storage event instead). */
export function broadcastState() {
  if (isDesktop) void emit('state-changed')
}

export function onStateChanged(fn: () => void): () => void {
  if (!isDesktop) return () => {}
  const un = listen('state-changed', fn)
  return () => void un.then((f) => f())
}

/** Click-through: while locked, mouse clicks pass through the overlay to the game. */
export function setOverlayLocked(p: Player, locked: boolean) {
  if (isDesktop) void emit('overlay-lock', { player: p, locked })
}

export function onOverlayLock(p: Player, fn: (locked: boolean) => void): () => void {
  if (!isDesktop) return () => {}
  const un = listen<{ player: Player; locked: boolean }>('overlay-lock', (e) => {
    if (e.payload.player === p) fn(e.payload.locked)
  })
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

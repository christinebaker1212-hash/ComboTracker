// Differences between running in a browser and in the Tauri desktop app.
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'
import { getAllWebviewWindows, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { Player } from './store/useStore'

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const overlayLabel = (p: Player, comboId?: string) => (comboId ? `overlay-${p}-${comboId}` : `overlay-${p}`)

/** A floating window as a scene remembers it. */
export interface FloatingInfo {
  label: string
  query: string
  title: string
  size: { width: number; height: number }
  /** Physical screen position (desktop only). */
  pos?: { x: number; y: number }
}

const FLOATING_KEY = 'combotracker:floating'
const browserWindows = new Map<string, Window>()

function registry(): Record<string, FloatingInfo> {
  try {
    return JSON.parse(localStorage.getItem(FLOATING_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Opens (or focuses) a see-through, always-on-top window for a page of this app. */
export async function openFloating(label: string, query: string, title: string, size: { width: number; height: number }, pos?: { x: number; y: number }): Promise<boolean> {
  try {
    localStorage.setItem(FLOATING_KEY, JSON.stringify({ ...registry(), [label]: { label, query, title, size } }))
  } catch {
    // Only scenes need this.
  }
  if (!isDesktop) {
    const w = window.open(`${location.pathname}?${query}`, label, `width=${size.width},height=${size.height}${pos ? `,left=${pos.x},top=${pos.y}` : ''}`)
    if (w) browserWindows.set(label, w)
    return !!w
  }
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    if (pos) await existing.setPosition(new PhysicalPosition(pos.x, pos.y))
    await existing.setFocus()
    return true
  }
  const win = new WebviewWindow(label, {
    url: `index.html?${query}`,
    title,
    ...size,
    transparent: true,
    decorations: false,
    shadow: false,
    alwaysOnTop: true,
    resizable: true,
  })
  // Placed after creation so it wins over the remembered position.
  if (pos) void win.once('tauri://created', () => setTimeout(() => void win.setPosition(new PhysicalPosition(pos.x, pos.y)), 150))
  return true
}

export async function closeFloating(label: string) {
  if (!isDesktop) {
    const w = browserWindows.get(label)
    if (w) w.close()
    else window.open('', label)?.close()
    browserWindows.delete(label)
    return
  }
  await (await WebviewWindow.getByLabel(label))?.close()
}

/** Every floating window that is open right now, with where it sits on screen. */
export async function openFloatingWindows(): Promise<FloatingInfo[]> {
  const reg = registry()
  if (!isDesktop) {
    return [...browserWindows].filter(([, w]) => !w.closed).flatMap(([label]) => (reg[label] ? [reg[label]] : []))
  }
  const wins = (await getAllWebviewWindows()).filter((w) => w.label !== 'main' && reg[w.label])
  return Promise.all(wins.map(async (w) => {
    const p = await w.outerPosition()
    return { ...reg[w.label], pos: { x: p.x, y: p.y } }
  }))
}

export async function isFloatingOpen(label: string): Promise<boolean> {
  if (!isDesktop) return !!browserWindows.get(label) && !browserWindows.get(label)!.closed
  return !!(await WebviewWindow.getByLabel(label))
}

/** Opens (or focuses) the pinned-combo overlay: all pinned combos, or a single one. */
export function openOverlay(p: Player, comboId?: string): Promise<boolean> {
  const q = `view=overlay&p=${p}${comboId ? `&combo=${comboId}` : ''}`
  return openFloating(overlayLabel(p, comboId), q, `ComboTracker overlay · Player ${p[1]}`, { width: 560, height: 240 })
}

export const closeOverlay = (p: Player, comboId?: string) => closeFloating(overlayLabel(p, comboId))

export const PRACTICE_HEARTBEAT_KEY = 'combotracker:practice-heartbeat'

/** True while a practice window is open (it refreshes a heartbeat twice a second). */
export function practiceActive(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(PRACTICE_HEARTBEAT_KEY) ?? 0) < 1500
  } catch {
    return false
  }
}

/** Opens practice mode for one combo as an always-on-top window. */
export const openPractice = (p: Player, comboId: string) =>
  openFloating(`overlay-practice-${p}`, `view=practice&p=${p}&combo=${comboId}`, 'ComboTracker practice', { width: 520, height: 220 })

/** Restarts any open practice window (used by the global hotkey). */
export function restartPractice() {
  if (isDesktop) void emit('practice-restart')
  else localStorage.setItem('combotracker:practice-restart', String(Date.now()))
}

export function onPracticeRestart(fn: () => void): () => void {
  if (!isDesktop) {
    const h = (e: StorageEvent) => e.key === 'combotracker:practice-restart' && fn()
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }
  const un = listen('practice-restart', fn)
  return () => void un.then((f) => f())
}

export const VIEWER_LABEL = 'viewer-main'

export const HISTORY_LABEL = 'viewer-history'

/** Opens the training-mode style input history. */
export const openHistory = () => openFloating(HISTORY_LABEL, 'view=history', 'ComboTracker input history', { width: 240, height: 520 })

/** Opens the live input viewer. */
export const openViewer = () => openFloating(VIEWER_LABEL, 'view=viewer', 'ComboTracker input viewer', { width: 420, height: 280 })

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

// Controllers read natively by the desktop app (XInput pads, and PlayStation
// pads over USB/Bluetooth HID), which keep reporting while another window such
// as the game has focus. The browser's Gamepad API goes quiet as soon as our
// window loses focus, so on the desktop these take priority.
// See src-tauri/src/pads.rs.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PadLike } from './core/input'
import { buttonsFromKeys, codeToVk, DEFAULT_KEYBOARD, SocdCleaner, type KeyboardSettings } from './core/keyboard'
import { isDesktop } from './platform'

export interface NativeSnapshot {
  index: number
  name: string
  vendor: number
  product: number
  /** Bit i = standard Gamepad API button i. */
  buttons: number
  lt: number
  rt: number
  /** -32768..32767, Y pointing down. */
  lx: number
  ly: number
  rx: number
  ry: number
}

/** Native pads use indices from here up, so they never clash with browser pad indices. */
export const NATIVE_INDEX_BASE = 100
/** The keyboard's index (see KEYBOARD_INDEX in pads.rs). */
export const KEYBOARD_INDEX = 120

const axis = (v: number) => Math.max(-1, Math.min(1, v / 32767))

export function padFromSnapshot(s: NativeSnapshot): PadLike {
  const buttons = Array.from({ length: 18 }, (_, i) => {
    const pressed = (s.buttons & (1 << i)) !== 0
    return { pressed, value: pressed ? 1 : 0 }
  })
  buttons[6] = { pressed: buttons[6].pressed || s.lt > 30, value: s.lt / 255 }
  buttons[7] = { pressed: buttons[7].pressed || s.rt > 30, value: s.rt / 255 }
  return { id: s.name, index: s.index, connected: true, buttons, axes: [axis(s.lx), axis(s.ly), axis(s.rx), axis(s.ry)] }
}

let pads: PadLike[] = []
let snapshots: NativeSnapshot[] = []
/** Keyboard buttons from the desktop app (read even while the game has focus). */
let nativeKeys = 0
const listeners = new Set<() => void>()

if (isDesktop) {
  const set = (list: NativeSnapshot[]) => {
    const connectedBefore = pads.map((p) => p.index).join()
    const kb = list.find((p) => p.index === KEYBOARD_INDEX)
    nativeKeys = kb?.buttons ?? 0
    snapshots = list.filter((p) => p !== kb)
    pads = snapshots.map(padFromSnapshot)
    const connectedNow = pads.map((p) => p.index).join()
    listeners.forEach((l) => l())
    // Lets pages that wait for "a controller was plugged in" start polling.
    if (connectedBefore !== connectedNow) window.dispatchEvent(new Event('nativepadschanged'))
  }
  void invoke<NativeSnapshot[]>('native_pads').then(set).catch(() => {})
  void listen<NativeSnapshot[]>('native-pads', (e) => set(e.payload))
}

// --- Keyboard ---
let keyboard: KeyboardSettings = DEFAULT_KEYBOARD
let sentKeys = ''
const heldCodes = new Set<string>()
const socd = new SocdCleaner()

/** Applies the keyboard settings; on the desktop, tells the background reader which keys to watch. */
export function setKeyboardConfig(cfg: KeyboardSettings) {
  const wasEnabled = keyboard.enabled
  keyboard = cfg
  if (isDesktop) {
    const keys = cfg.enabled
      ? Object.entries(cfg.map).flatMap(([code, b]) => {
        const vk = codeToVk(code)
        return vk ? [[vk, b] as [number, number]] : []
      })
      : []
    const key = JSON.stringify(keys)
    if (key !== sentKeys) {
      sentKeys = key
      void invoke('set_keyboard', { keys }).catch(() => {})
    }
  }
  if (wasEnabled !== cfg.enabled) window.dispatchEvent(new Event('nativepadschanged'))
}

// In the browser (or while our own window has focus) keys arrive as events.
if (typeof window !== 'undefined' && !isDesktop) {
  const changed = () => listeners.forEach((l) => l())
  window.addEventListener('keydown', (e) => {
    if (!keyboard.enabled || e.repeat || keyboard.map[e.code] === undefined || typingHere()) return
    heldCodes.add(e.code)
    changed()
  })
  window.addEventListener('keyup', (e) => {
    if (heldCodes.delete(e.code)) changed()
  })
  window.addEventListener('blur', () => {
    heldCodes.clear()
    changed()
  })
}

/** Typing into a text box in this window shouldn't press buttons. */
function typingHere(): boolean {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Buttons the keyboard is pressing right now, after SOCD cleaning. */
function keyboardButtons(): Set<number> {
  if (!keyboard.enabled || typingHere()) return new Set()
  const raw = isDesktop
    ? new Set(Array.from({ length: 32 }, (_, i) => i).filter((i) => nativeKeys & (1 << i)))
    : buttonsFromKeys(heldCodes, keyboard.map)
  return socd.clean(raw, keyboard.socd)
}

/** Adds the keyboard's presses to a pad, or makes a keyboard-only pad. */
function withKeyboard(pad: PadLike | null): PadLike | null {
  if (!keyboard.enabled) return pad
  const keys = keyboardButtons()
  const base = pad ?? {
    id: 'Keyboard (ComboTracker)', index: KEYBOARD_INDEX, connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
  }
  if (!keys.size) return base
  const buttons = Array.from({ length: Math.max(18, base.buttons.length) }, (_, i) =>
    keys.has(i) ? { pressed: true, value: 1 } : base.buttons[i] ?? { pressed: false, value: 0 })
  return { ...base, buttons }
}

/** Natively read controllers, newest state. Empty in the browser. */
export const nativePads = (): PadLike[] => pads

/** Calls back whenever a native controller's state changes. */
export function onNativePads(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const hex = (n: number) => n.toString(16).padStart(4, '0')

/** True if a browser pad is one we already read natively (same vendor/product, or any XInput pad). */
function isDuplicate(id: string): boolean {
  return snapshots.some((n) =>
    n.index < NATIVE_INDEX_BASE + 10
      ? /xinput|xbox|045e/i.test(id)
      : new RegExp(`${hex(n.vendor)}.*${hex(n.product)}`, 'i').test(id),
  )
}

/**
 * Every connected controller: natively read ones first (they work while the
 * game has focus), then the browser's, minus duplicates of the native ones.
 */
export function connectedPads(): PadLike[] {
  const browser = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected)
  if (!pads.length) return browser
  return [...pads, ...browser.filter((p) => !isDuplicate(p.id))]
}

/**
 * The chosen pad, or the first connected one when set to automatic. If the
 * chosen pad has gone (unplugged, or now read natively), the first one is used.
 * Keyboard presses are merged in when keyboard play is on.
 */
export function pickPad(index: number | null): PadLike | null {
  const list = connectedPads()
  // The keyboard (when turned on) adds to whichever pad is in use, so both work.
  return withKeyboard((index === null ? undefined : list.find((p) => p.index === index)) ?? list[0] ?? null)
}

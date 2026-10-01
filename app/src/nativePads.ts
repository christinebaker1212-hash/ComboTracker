// Controllers read natively by the desktop app (XInput pads, and PlayStation
// pads over USB/Bluetooth HID), which keep reporting while another window such
// as the game has focus. The browser's Gamepad API goes quiet as soon as our
// window loses focus, so on the desktop these take priority.
// See src-tauri/src/pads.rs.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PadLike } from './core/input'
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
const listeners = new Set<() => void>()

if (isDesktop) {
  const set = (list: NativeSnapshot[]) => {
    const connectedBefore = pads.map((p) => p.index).join()
    snapshots = list
    pads = list.map(padFromSnapshot)
    const connectedNow = pads.map((p) => p.index).join()
    listeners.forEach((l) => l())
    // Lets pages that wait for "a controller was plugged in" start polling.
    if (connectedBefore !== connectedNow) window.dispatchEvent(new Event('nativepadschanged'))
  }
  void invoke<NativeSnapshot[]>('native_pads').then(set).catch(() => {})
  void listen<NativeSnapshot[]>('native-pads', (e) => set(e.payload))
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
 */
export function pickPad(index: number | null): PadLike | null {
  const list = connectedPads()
  return (index === null ? undefined : list.find((p) => p.index === index)) ?? list[0] ?? null
}

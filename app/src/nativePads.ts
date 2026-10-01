// Controllers read natively by the desktop app (XInput), which keep reporting
// while another window such as the game has focus. The browser's Gamepad API
// goes quiet for Xbox-style pads as soon as our window loses focus, so on the
// desktop these take priority. See src-tauri/src/pads.rs.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PadLike } from './core/input'
import { isDesktop } from './platform'

export interface NativeSnapshot {
  slot: number
  buttons: number
  lt: number
  rt: number
  lx: number
  ly: number
  rx: number
  ry: number
}

/** Native pads use indices from here up, so they never clash with browser pad indices. */
export const NATIVE_INDEX_BASE = 100

// XInput button bit → standard Gamepad API button index.
const BITS: [number, number][] = [
  [0x1000, 0], [0x2000, 1], [0x4000, 2], [0x8000, 3], [0x0100, 4], [0x0200, 5],
  [0x0020, 8], [0x0010, 9], [0x0040, 10], [0x0080, 11],
  [0x0001, 12], [0x0002, 13], [0x0004, 14], [0x0008, 15],
]

const axis = (v: number) => Math.max(-1, v / 32767)

export function padFromSnapshot(s: NativeSnapshot): PadLike {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
  for (const [bit, i] of BITS) if (s.buttons & bit) buttons[i] = { pressed: true, value: 1 }
  buttons[6] = { pressed: s.lt > 30, value: s.lt / 255 }
  buttons[7] = { pressed: s.rt > 30, value: s.rt / 255 }
  return {
    // Worded like the browser's XInput ids so controller detection recognises it.
    id: `Xbox Controller (XInput STANDARD GAMEPAD, player ${s.slot + 1})`,
    index: NATIVE_INDEX_BASE + s.slot,
    connected: true,
    buttons,
    // XInput's Y axes point up; the Gamepad API's point down.
    axes: [axis(s.lx), -axis(s.ly), axis(s.rx), -axis(s.ry)],
  }
}

let pads: PadLike[] = []
const listeners = new Set<() => void>()

if (isDesktop) {
  const set = (list: NativeSnapshot[]) => {
    const connectedBefore = pads.map((p) => p.index).join()
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

/** Browser pads that are probably the same XInput controller we already read natively. */
const isXInputDuplicate = (id: string) => /xinput|xbox|045e/i.test(id)

/**
 * Every connected controller: natively read ones first (they work while the
 * game has focus), then the browser's, minus duplicates of the native ones.
 */
export function connectedPads(): PadLike[] {
  const browser = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected)
  if (!pads.length) return browser
  return [...pads, ...browser.filter((p) => !isXInputDuplicate(p.id))]
}

/**
 * The chosen pad, or the first connected one when set to automatic. If the
 * chosen pad has gone (unplugged, or now read natively), the first one is used.
 */
export function pickPad(index: number | null): PadLike | null {
  const list = connectedPads()
  return (index === null ? undefined : list.find((p) => p.index === index)) ?? list[0] ?? null
}

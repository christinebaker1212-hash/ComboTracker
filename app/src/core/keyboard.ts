// Keyboard and hitbox play: keys stand in for controller buttons, so the
// editor, input viewer and practice mode work for keyboard players and
// leverless controllers in keyboard mode. Keys map to standard Gamepad API
// button indices, which then go through exactly the same path as a pad.

/** Standard Gamepad API button indices, as used everywhere else. */
export const PAD_INDEX = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const

/**
 * How opposite directions held together resolve (SOCD cleaning), like on a hitbox:
 * - neutral: left+right = neutral, up+down = up (the tournament standard)
 * - last: the most recently pressed one wins
 */
export type Socd = 'neutral' | 'last'

export interface KeyboardSettings {
  enabled: boolean
  /** KeyboardEvent.code → standard button index. */
  map: Record<string, number>
  socd: Socd
}

// Matches the PC icon style: WASD to move, U I O / J K L for punches and kicks.
export const DEFAULT_KEYMAP: Record<string, number> = {
  KeyW: PAD_INDEX.UP, Space: PAD_INDEX.UP, KeyA: PAD_INDEX.LEFT, KeyS: PAD_INDEX.DOWN, KeyD: PAD_INDEX.RIGHT,
  KeyU: PAD_INDEX.X, KeyI: PAD_INDEX.Y, KeyO: PAD_INDEX.RB,
  KeyJ: PAD_INDEX.A, KeyK: PAD_INDEX.B, KeyL: PAD_INDEX.RT,
  KeyP: PAD_INDEX.LB, Semicolon: PAD_INDEX.LT,
}

export const DEFAULT_KEYBOARD: KeyboardSettings = { enabled: false, map: DEFAULT_KEYMAP, socd: 'neutral' }

/** What each button is for, in the order the remapping list shows them. */
export const KEY_ROLES: { index: number; label: string }[] = [
  { index: PAD_INDEX.UP, label: 'Up' },
  { index: PAD_INDEX.DOWN, label: 'Down' },
  { index: PAD_INDEX.LEFT, label: 'Left (back)' },
  { index: PAD_INDEX.RIGHT, label: 'Right (forward)' },
  { index: PAD_INDEX.X, label: 'LP' },
  { index: PAD_INDEX.Y, label: 'MP' },
  { index: PAD_INDEX.RB, label: 'HP' },
  { index: PAD_INDEX.A, label: 'LK' },
  { index: PAD_INDEX.B, label: 'MK' },
  { index: PAD_INDEX.RT, label: 'HK' },
  { index: PAD_INDEX.LB, label: 'Any P' },
  { index: PAD_INDEX.LT, label: 'Any K' },
  { index: PAD_INDEX.START, label: 'Start' },
  { index: PAD_INDEX.BACK, label: 'Select' },
]

/** KeyboardEvent.code → Windows virtual-key code, for reading keys while the game has focus. */
export function codeToVk(code: string): number | null {
  let m = code.match(/^Key([A-Z])$/)
  if (m) return m[1].charCodeAt(0)
  m = code.match(/^Digit([0-9])$/)
  if (m) return 0x30 + Number(m[1])
  m = code.match(/^Numpad([0-9])$/)
  if (m) return 0x60 + Number(m[1])
  m = code.match(/^F([1-9]|1[0-2])$/)
  if (m) return 0x6f + Number(m[1])
  return VK[code] ?? null
}

const VK: Record<string, number> = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0d, CapsLock: 0x14, Escape: 0x1b, Space: 0x20,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5,
  NumpadMultiply: 0x6a, NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadDecimal: 0x6e, NumpadDivide: 0x6f,
  NumpadEnter: 0x0d, Semicolon: 0xba, Equal: 0xbb, Comma: 0xbc, Minus: 0xbd, Period: 0xbe, Slash: 0xbf,
  Backquote: 0xc0, BracketLeft: 0xdb, Backslash: 0xdc, BracketRight: 0xdd, Quote: 0xde,
}

/** A short name for a key: "W", "Space", "↑", "Num 4". */
export function keyLabel(code: string): string {
  const m = code.match(/^(?:Key|Digit)(.+)$/)
  if (m) return m[1]
  const named: Record<string, string> = {
    ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓', Semicolon: ';', Quote: "'", Comma: ',',
    Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
    Backquote: '`', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt',
  }
  return named[code] ?? code.replace(/^Numpad/, 'Num ')
}

/**
 * Cleans opposite directions. `order` remembers which direction of each axis
 * was pressed last, for "last input wins"; pass the same object every frame.
 */
export class SocdCleaner {
  private lastH: number | null = null
  private lastV: number | null = null
  private prev = new Set<number>()

  clean(pressed: Set<number>, mode: Socd): Set<number> {
    for (const b of pressed) {
      if (this.prev.has(b)) continue
      if (b === PAD_INDEX.LEFT || b === PAD_INDEX.RIGHT) this.lastH = b
      if (b === PAD_INDEX.UP || b === PAD_INDEX.DOWN) this.lastV = b
    }
    this.prev = new Set(pressed)
    const out = new Set(pressed)
    if (out.has(PAD_INDEX.LEFT) && out.has(PAD_INDEX.RIGHT)) {
      out.delete(PAD_INDEX.LEFT)
      out.delete(PAD_INDEX.RIGHT)
      if (mode === 'last' && this.lastH !== null) out.add(this.lastH)
    }
    if (out.has(PAD_INDEX.UP) && out.has(PAD_INDEX.DOWN)) {
      out.delete(mode === 'last' && this.lastV === PAD_INDEX.DOWN ? PAD_INDEX.UP : PAD_INDEX.DOWN)
    }
    return out
  }
}

/** The buttons a set of held keys presses. */
export function buttonsFromKeys(held: Iterable<string>, map: Record<string, number>): Set<number> {
  const out = new Set<number>()
  for (const code of held) if (map[code] !== undefined) out.add(map[code])
  return out
}

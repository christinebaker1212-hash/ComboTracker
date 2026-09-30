// Turns raw controller frames into combo edits. Hardware-independent: feed it
// one frame per poll (from the browser Gamepad API, a keyboard, or a test) and
// it returns what to insert.
import type { Direction, Token } from './tokens'

/** Controller buttons in Xbox naming, which is what the original app used. */
export type PadButton =
  | 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'BACK' | 'START' | 'L3' | 'R3'

export interface Frame {
  /** Milliseconds, monotonic (performance.now()). */
  time: number
  dir: Direction | null
  buttons: ReadonlySet<PadButton>
}

export type InputEvent =
  | { type: 'insert'; tokens: Token[] }
  | { type: 'mutate'; from: Token; to: Token }

export const DEFAULT_BUTTON_MAP: Record<PadButton, Token> = {
  X: 'lp', Y: 'mp', RB: 'hp', A: 'lk', B: 'mk', RT: 'hk', LB: 'any_p', LT: 'any_k',
  START: 'start', BACK: 'select', L3: 'l3', R3: 'r3',
}

export interface Chord {
  buttons: Token[]
  emit: Token
  /** Chords sharing a group are alternatives: only the first match in the group fires. */
  group?: string
}

/** How a game turns simultaneous presses into its own buttons (e.g. Tekken 1+2). */
export interface InputProfile {
  /** Buttons that don't exist in this game and are ignored. */
  ignore: Token[]
  chords: Chord[]
}

const PLAIN: InputProfile = { ignore: [], chords: [] }

const TEKKEN: InputProfile = {
  ignore: ['hp', 'hk', 'any_p', 'any_k'],
  chords: [
    { buttons: ['lk', 'mk', 'mp'], emit: 'hcf', group: 'motion' },
    { buttons: ['lk', 'lp', 'mp'], emit: 'hcb', group: 'motion' },
    { buttons: ['lp', 'mp', 'mk'], emit: 'rdp', group: 'motion' },
    { buttons: ['lp', 'lk', 'mk'], emit: 'dp', group: 'motion' },
    { buttons: ['mp', 'mk'], emit: 'qcf', group: 'motion' },
    { buttons: ['lp', 'lk'], emit: 'qcb', group: 'motion' },
    { buttons: ['lp', 'mp'], emit: 'hp' },
    { buttons: ['lk', 'mk'], emit: 'hk' },
    { buttons: ['lp', 'mk'], emit: 'any_p' },
    { buttons: ['lk', 'mp'], emit: 'any_k' },
  ],
}

export const INPUT_PROFILES: Record<string, InputProfile> = {
  Tekken: TEKKEN,
  'Tekken 3': TEKKEN,
  BlazBlue: {
    ignore: ['any_p', 'any_k'],
    chords: [
      { buttons: ['lp', 'mp', 'lk', 'mk'], emit: 'any_k', group: 'a' },
      { buttons: ['lp', 'mp', 'mk'], emit: 'any_p', group: 'a' },
    ],
  },
  'Persona 4': {
    ignore: ['any_p', 'any_k'],
    chords: [
      { buttons: ['lp', 'lk', 'mk'], emit: 'any_p', group: 'a' },
      { buttons: ['lp', 'mp', 'mk'], emit: 'any_k', group: 'a' },
    ],
  },
  FighterZ: {
    ignore: ['any_p', 'any_k'],
    chords: [
      { buttons: ['lp', 'mp', 'lk', 'mk'], emit: 'any_k', group: 'a' },
      { buttons: ['lk', 'mk'], emit: 'any_p', group: 'a' },
    ],
  },
  // Four-button games. Their sequence-based specials (Soul Calibur slides, SNK
  // desperation moves) are not ported yet.
  'Soul Calibur': { ignore: ['hp', 'hk', 'any_p', 'any_k'], chords: [] },
  SNK: { ignore: ['hp', 'hk', 'any_p', 'any_k'], chords: [] },
}

export const profileFor = (glyph: string) => INPUT_PROFILES[glyph] ?? PLAIN

const OUTPUT_ORDER: Token[] = [
  'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3',
]

/** Resolves one batch of simultaneous presses into tokens, e.g. {lp, mp} in Tekken → [hp]. */
export function resolveChord(pressed: Set<Token>, profile: InputProfile): Token[] {
  const active = new Set([...pressed].filter((t) => !profile.ignore.includes(t)))
  const firstTier: Token[] = []
  const attacks: Token[] = []
  const firedGroups = new Set<string>()
  for (const chord of profile.chords) {
    if (chord.group && firedGroups.has(chord.group)) continue
    if (!chord.buttons.every((b) => active.has(b))) continue
    chord.buttons.forEach((b) => active.delete(b))
    if (chord.group) firedGroups.add(chord.group)
    ;(chord.group === 'motion' ? firstTier : attacks).push(chord.emit)
  }
  for (const t of OUTPUT_ORDER) if (active.has(t)) attacks.push(t)

  const out: Token[] = [...firstTier]
  attacks.forEach((a, i) => {
    if (i > 0 || firstTier.length) out.push('plus')
    out.push(a)
  })
  return out
}

export const TIMING = {
  /** A direction must be held this long before it's recorded, filtering diagonal slop. */
  dirSettleMs: 15,
  /** Presses within this window count as one simultaneous input (≈5 frames at 60 fps). */
  chordWindowMs: 83,
  /** Holding this long turns a direction into a charge input, or a button into a hold input. */
  holdMs: 750,
}

export class InputInterpreter {
  private lastDir: Direction | null = null
  private dirStableSince: number | null = null
  private committedDir: Direction | null = null
  private dirHeldSince: number | null = null
  private dirCharged = false

  private lastButtons = new Set<PadButton>()
  private chordBuffer = new Set<PadButton>()
  private chordStart: number | null = null
  private holdSince = new Map<PadButton, number>()
  private holdFired = new Set<PadButton>()

  buttonMap: Record<PadButton, Token>
  profile: InputProfile

  constructor(buttonMap: Record<PadButton, Token> = DEFAULT_BUTTON_MAP, profile: InputProfile = PLAIN) {
    this.buttonMap = buttonMap
    this.profile = profile
  }

  reset() {
    this.lastDir = null
    this.dirStableSince = null
    this.committedDir = null
    this.dirHeldSince = null
    this.dirCharged = false
    this.lastButtons.clear()
    this.chordBuffer.clear()
    this.chordStart = null
    this.holdSince.clear()
    this.holdFired.clear()
  }

  update(f: Frame): InputEvent[] {
    const events: InputEvent[] = []

    // --- Directions ---
    if (f.dir !== this.lastDir) {
      this.dirStableSince = f.dir ? f.time : null
      this.committedDir = null
      this.dirHeldSince = f.dir ? f.time : null
      this.dirCharged = false
      this.lastDir = f.dir
    }
    if (f.dir && this.dirStableSince !== null && this.committedDir !== f.dir &&
        f.time - this.dirStableSince >= TIMING.dirSettleMs) {
      events.push({ type: 'insert', tokens: [f.dir] })
      this.committedDir = f.dir
    }
    if (f.dir && this.dirHeldSince !== null && !this.dirCharged &&
        f.time - this.dirHeldSince >= TIMING.holdMs) {
      this.dirCharged = true
      events.push({ type: 'mutate', from: f.dir, to: `c_${f.dir}` })
    }

    // --- Buttons ---
    for (const b of f.buttons) {
      if (!this.lastButtons.has(b)) {
        this.chordBuffer.add(b)
        this.chordStart ??= f.time
        this.holdSince.set(b, f.time)
        this.holdFired.delete(b)
      } else if (!this.holdFired.has(b) && f.time - (this.holdSince.get(b) ?? f.time) >= TIMING.holdMs) {
        this.holdFired.add(b)
        const tok = this.buttonMap[b]
        if (tok) events.push({ type: 'mutate', from: tok, to: `h_${tok}` })
      }
    }
    for (const b of this.lastButtons) if (!f.buttons.has(b)) this.holdSince.delete(b)
    this.lastButtons = new Set(f.buttons)

    if (this.chordStart !== null && f.time - this.chordStart >= TIMING.chordWindowMs) {
      const pressed = new Set([...this.chordBuffer].map((b) => this.buttonMap[b]).filter(Boolean))
      const tokens = resolveChord(pressed, this.profile)
      if (tokens.length) events.push({ type: 'insert', tokens })
      this.chordBuffer.clear()
      this.chordStart = null
    }
    return events
  }
}

/** Standard Gamepad API button indices → pad buttons. */
export const STANDARD_GAMEPAD: Partial<Record<number, PadButton>> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'BACK', 9: 'START', 10: 'L3', 11: 'R3',
}

export function dirFrom(up: boolean, down: boolean, left: boolean, right: boolean): Direction | null {
  if (up && left) return 'upleft'
  if (up && right) return 'upright'
  if (down && left) return 'downleft'
  if (down && right) return 'downright'
  if (up) return 'up'
  if (down) return 'down'
  if (left) return 'left'
  if (right) return 'right'
  return null
}

/** Reads a browser Gamepad into a Frame: D-pad or left stick for directions. */
export function frameFromGamepad(pad: Gamepad, time: number): Frame {
  const pressed = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5
  const [lx = 0, ly = 0] = pad.axes
  const dir = dirFrom(
    pressed(12) || ly < -0.5,
    pressed(13) || ly > 0.5,
    pressed(14) || lx < -0.5,
    pressed(15) || lx > 0.5,
  )
  const buttons = new Set<PadButton>()
  for (const [i, name] of Object.entries(STANDARD_GAMEPAD)) if (name && pressed(Number(i))) buttons.add(name)
  return { time, dir, buttons }
}

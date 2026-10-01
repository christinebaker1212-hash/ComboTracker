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
  /** Sequence-based extras that need input history. */
  special?: 'soulcalibur' | 'snk'
  /**
   * Custom glyph packs: token → controller buttons pressed together. When set,
   * this replaces the default button map entirely.
   */
  padMap?: { buttons: PadButton[]; emit: Token }[]
}

/** Accepts the desktop app's XInput names too ("RIGHT_SHOULDER" → "RB"). */
const PAD_ALIASES: Record<string, PadButton> = {
  RIGHT_SHOULDER: 'RB', LEFT_SHOULDER: 'LB', LEFT_THUMB: 'L3', RIGHT_THUMB: 'R3', SELECT: 'BACK',
}
export const PAD_BUTTONS: PadButton[] = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3']

export function parsePadCombo(text: string): PadButton[] {
  return text
    .toUpperCase()
    .split('+')
    .map((b) => b.trim())
    .map((b) => PAD_ALIASES[b] ?? b)
    .filter((b): b is PadButton => (PAD_BUTTONS as string[]).includes(b))
}

/** Builds the input profile for a user glyph pack's controller mapping. */
export function profileFromMappings(mappings: Record<string, string>): InputProfile {
  const padMap = Object.entries(mappings)
    .map(([emit, combo]) => ({ emit, buttons: parsePadCombo(combo) }))
    .filter((m) => m.buttons.length)
    .sort((a, b) => b.buttons.length - a.buttons.length)
  return { ignore: [], chords: [], padMap }
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
  // Four-button games with sequence-based extras (see InputInterpreter.resolve).
  'Soul Calibur': { ignore: ['hp', 'hk', 'any_p', 'any_k'], chords: [], special: 'soulcalibur' },
  SNK: { ignore: ['hp', 'hk', 'any_p', 'any_k'], chords: [], special: 'snk' },
}

export const profileFor = (glyph: string) => INPUT_PROFILES[glyph] ?? PLAIN

const OUTPUT_ORDER: Token[] = [
  'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3',
]

const joinWithPlus = (firstTier: Token[], attacks: Token[]): Token[] => {
  const out: Token[] = [...firstTier]
  attacks.forEach((a, i) => {
    if (i > 0 || firstTier.length) out.push('plus')
    out.push(a)
  })
  return out
}

/** True if `sub` appears in order (not necessarily adjacent) within `seq`. */
export function hasSubsequence<T>(seq: T[], sub: T[]): boolean {
  let i = 0
  for (const x of seq) if (x === sub[i]) i++
  return i === sub.length
}

const SNK_MOVES: { dirs: Direction[]; emit: Token }[] = [
  { dirs: ['downleft', 'right', 'downright', 'down', 'downleft', 'left', 'downright'], emit: 'any_k' },
  { dirs: ['right', 'left', 'downleft', 'down', 'downright', 'right'], emit: 'any_p' },
  { dirs: ['right', 'downright', 'down', 'downleft', 'left', 'downleft', 'down', 'downright', 'right'], emit: 'hk' },
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
  return joinWithPlus(firstTier, attacks)
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
  /** Recent committed directions and button batches, for sequence-based specials. */
  private dirHistory: { dir: Direction; time: number }[] = []
  private btnHistory: { count: number; time: number }[] = []

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
    this.dirHistory = []
    this.btnHistory = []
  }

  /** Token a single pad button stands for, used for hold detection. */
  private tokenFor(b: PadButton): Token | undefined {
    if (this.profile.padMap) return this.profile.padMap.find((m) => m.buttons.length === 1 && m.buttons[0] === b)?.emit
    return this.buttonMap[b]
  }

  private resolve(buffer: Set<PadButton>, now: number): Token[] {
    this.btnHistory = [...this.btnHistory.filter((h) => now - h.time < 2000), { count: buffer.size, time: now }]
    const p = this.profile

    // Custom mapping: biggest button combinations first, e.g. LB+RB before LB.
    if (p.padMap) {
      const left = new Set(buffer)
      const attacks: Token[] = []
      for (const m of p.padMap) {
        if (m.buttons.every((b) => left.has(b))) {
          attacks.push(m.emit)
          m.buttons.forEach((b) => left.delete(b))
        }
      }
      return joinWithPlus([], attacks)
    }

    const pressed = new Set([...buffer].map((b) => this.buttonMap[b]).filter(Boolean))

    if (p.special === 'soulcalibur') {
      // A press within 200 ms of the previous one is a "slide": LP→HP, MP→HK, MK→Any P.
      const prev = this.btnHistory.at(-2)
      if (prev && now - prev.time < 200) {
        const slides: [Token, Token][] = [['lp', 'hp'], ['mp', 'hk'], ['mk', 'any_p']]
        const hit = slides.find(([from]) => pressed.has(from))
        if (hit) {
          pressed.delete(hit[0])
          const rest = resolveChord(pressed, p).filter((t) => t !== 'plus')
          return joinWithPlus([], [hit[1], ...rest])
        }
      }
    }

    if (p.special === 'snk') {
      const recent = this.dirHistory.filter((d) => now - d.time < 1500).map((d) => d.dir)
      const move = SNK_MOVES.find((m) => hasSubsequence(recent, m.dirs))
      if (move) {
        this.dirHistory = []
        return [move.emit]
      }
      if (this.btnHistory.filter((b) => now - b.time < 1500).length >= 5) {
        this.btnHistory = []
        return ['hp']
      }
    }

    return resolveChord(pressed, p)
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
      this.dirHistory = [...this.dirHistory, { dir: f.dir, time: f.time }].slice(-30)
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
        const tok = this.tokenFor(b)
        if (tok) events.push({ type: 'mutate', from: tok, to: `h_${tok}` })
      }
    }
    for (const b of this.lastButtons) if (!f.buttons.has(b)) this.holdSince.delete(b)
    this.lastButtons = new Set(f.buttons)

    if (this.chordStart !== null && f.time - this.chordStart >= TIMING.chordWindowMs) {
      const tokens = this.resolve(this.chordBuffer, f.time)
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

/** Every input the viewer can light up, keyed by the layout element IDs. */
export interface PadState {
  pressed: Set<string>
  left: [number, number]
  right: [number, number]
  dir: Direction | null
}

const VIEWER_BUTTONS: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LEFT_SHOULDER', 5: 'RIGHT_SHOULDER', 6: 'LT', 7: 'RT',
  8: 'BACK', 9: 'START', 10: 'LEFT_THUMB', 11: 'RIGHT_THUMB',
  12: 'DPAD_UP', 13: 'DPAD_DOWN', 14: 'DPAD_LEFT', 15: 'DPAD_RIGHT', 17: 'TOUCHPAD',
}

export function padStateFromGamepad(pad: Gamepad): PadState {
  const pressed = new Set<string>()
  pad.buttons.forEach((b, i) => {
    if ((b.pressed || b.value > 0.5) && VIEWER_BUTTONS[i]) pressed.add(VIEWER_BUTTONS[i])
  })
  const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes
  const stick = (x: number, y: number, prefix: string) => {
    if (y < -0.5) pressed.add(`${prefix}_UP`)
    if (y > 0.5) pressed.add(`${prefix}_DOWN`)
    if (x < -0.5) pressed.add(`${prefix}_LEFT`)
    if (x > 0.5) pressed.add(`${prefix}_RIGHT`)
  }
  stick(lx, ly, 'L_STICK')
  stick(rx, ry, 'R_STICK')
  const dir = dirFrom(
    pressed.has('DPAD_UP') || ly < -0.5,
    pressed.has('DPAD_DOWN') || ly > 0.5,
    pressed.has('DPAD_LEFT') || lx < -0.5,
    pressed.has('DPAD_RIGHT') || lx > 0.5,
  )
  return { pressed, left: [lx, ly], right: [rx, ry], dir }
}

/** Pads the Gamepad API currently reports, for the controller picker. */
export function connectedPads(): Gamepad[] {
  return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected)
}

/** Picks the chosen pad, or the first connected one when set to automatic. */
export function pickPad(index: number | null): Gamepad | null {
  const pads = connectedPads()
  return (index === null ? pads[0] : pads.find((p) => p.index === index)) ?? null
}

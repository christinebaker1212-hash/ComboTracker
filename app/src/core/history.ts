// Training-mode style input history: one row per change of stick or buttons,
// with how many frames it was held. Fed one controller frame at a time.
import { DEFAULT_BUTTON_MAP, type Frame, type InputProfile, type PadButton } from './input'
import type { Direction, Token } from './tokens'

export interface HistoryEntry {
  dir: Direction | null
  /** Every button held during this row. */
  buttons: Token[]
  /** The ones pressed on this row (the rest were already held). */
  fresh: Token[]
  /** When the row started (ms) and, once the next row starts, how many frames it lasted. */
  start: number
  frames: number | null
}

const FRAME_MS = 1000 / 60
/** Rows stop counting up here, like the games do. */
export const MAX_FRAMES = 99

export const framesBetween = (from: number, to: number) => Math.min(MAX_FRAMES, Math.max(1, Math.round((to - from) / FRAME_MS)))

/** Which token a single controller button is, in the current icon style. */
export function buttonTokens(buttons: ReadonlySet<PadButton>, profile?: InputProfile, map = DEFAULT_BUTTON_MAP): Token[] {
  const out: Token[] = []
  for (const b of buttons) {
    const t = profile?.padMap
      ? profile.padMap.find((m) => m.buttons.length === 1 && m.buttons[0] === b)?.emit
      : map[b]
    if (t && !out.includes(t)) out.push(t)
  }
  const order: Token[] = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3']
  return out.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export class InputHistory {
  /** Newest first. */
  entries: HistoryEntry[] = []
  private max: number
  private key = ''

  constructor(max = 30) {
    this.max = max
  }

  clear() {
    this.entries = []
    this.key = ''
  }

  /** Feeds one frame. Returns true when a new row was added. */
  update(f: Frame, profile?: InputProfile): boolean {
    const buttons = buttonTokens(f.buttons, profile)
    const key = `${f.dir}|${buttons.join()}`
    if (key === this.key) return false
    const prev = this.entries[0]
    // Ignore the idle state before the first input.
    if (!prev && !f.dir && !buttons.length) return false
    this.key = key
    if (prev) prev.frames = framesBetween(prev.start, f.time)
    const held = new Set(prev?.buttons ?? [])
    this.entries.unshift({ dir: f.dir, buttons, fresh: buttons.filter((b) => !held.has(b)), start: f.time, frames: null })
    if (this.entries.length > this.max) this.entries.length = this.max
    return true
  }

  /** Frames for a row; the newest row counts up live. */
  framesOf(e: HistoryEntry, now: number): number {
    return e.frames ?? framesBetween(e.start, now)
  }
}

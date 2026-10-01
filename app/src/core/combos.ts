// Combo lists and their on-disk format. Reads both file shapes the desktop app
// writes: a full list ({glyph, slot_count, slots}) and a single combo ({name, tokens}).
import type { Token } from './tokens'

export interface Combo {
  id: string
  name: string
  tokens: Token[]
  pinned: boolean
  /** Shown indented under the combo above it (the old "[>]" name prefix). */
  child: boolean
  /** Short extra info shown under the name, e.g. "OD: 236PP". */
  notes?: string
  /**
   * Reference rhythm for practice: frames between one button press and the
   * next, recorded from the controller or taken from a clean run.
   */
  timing?: number[]
}

export interface ComboListFile {
  glyph?: string
  theme?: string
  slot_count?: number
  slots: { name: string; tokens: Token[]; notes?: string; timing?: number[] }[]
}

export const MAX_SLOTS = 250

let nextId = 0
export const newId = () => `c${Date.now().toString(36)}${(nextId++).toString(36)}`

export function makeCombo(name = '', tokens: Token[] = [], notes?: string): Combo {
  const trimmed = name.trim()
  const child = trimmed.startsWith('[>]')
  return {
    id: newId(),
    name: child ? trimmed.slice(3).trim() : name,
    tokens: [...tokens],
    pinned: false,
    child,
    ...(notes ? { notes } : {}),
  }
}

export function emptyList(count = 8): Combo[] {
  return Array.from({ length: count }, (_, i) => makeCombo(`Combo ${i + 1}`))
}

/** Keeps a saved practice rhythm if it's a list of frame counts. */
function withTiming(timing: unknown, c: Combo): Combo {
  return Array.isArray(timing) && timing.every((n) => typeof n === 'number' && n >= 0) ? { ...c, timing } : c
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export interface ParsedFile {
  glyph?: string
  combos: Combo[]
  truncated: boolean
}

/** Parses any combo JSON the app has ever written. Throws with a readable message if it isn't one. */
export function parseComboFile(json: unknown): ParsedFile {
  if (!json || typeof json !== 'object') throw new Error('File is not a combo list.')
  const data = json as Record<string, unknown>
  if (Array.isArray(data.slots)) {
    const slots = data.slots.filter(
      (s): s is { name?: unknown; tokens?: unknown; notes?: unknown; timing?: unknown } => !!s && typeof s === 'object',
    )
    const combos = slots.map((s, i) => withTiming(s.timing,
      makeCombo(
        typeof s.name === 'string' ? s.name.split('\n')[0] : `Combo ${i + 1}`,
        isStringArray(s.tokens) ? s.tokens : [],
        typeof s.notes === 'string' && s.notes
          ? s.notes
          : typeof s.name === 'string' ? s.name.split('\n').slice(1).map((l) => l.trim().replace(/^\((.*)\)$/, '$1')).filter(Boolean).join(' · ') : undefined,
      ),
    ))
    return {
      glyph: typeof data.glyph === 'string' ? data.glyph : undefined,
      combos: combos.slice(0, MAX_SLOTS),
      truncated: combos.length > MAX_SLOTS,
    }
  }
  if (isStringArray(data.tokens)) {
    return {
      combos: [makeCombo(typeof data.name === 'string' ? data.name : 'Loaded combo', data.tokens)],
      truncated: false,
    }
  }
  throw new Error('File is not a combo list: expected "slots" or "tokens".')
}

/** Serialises in the desktop app's format so files stay interchangeable. */
export function toComboFile(combos: Combo[], glyph: string): ComboListFile {
  return {
    glyph,
    slot_count: combos.length,
    slots: combos.map((c) => ({
      name: c.child ? `[>] ${c.name}` : c.name,
      tokens: c.tokens,
      ...(c.notes ? { notes: c.notes } : {}),
      ...(c.timing?.length ? { timing: c.timing } : {}),
    })),
  }
}

// Turns typed fighting-game notation into combo tokens, so combos can be
// entered by typing instead of clicking. Supports numpad notation and the
// words the app already uses:
//   "2MK > 236HP"      → ↓+MK ➔ QCF+HP
//   "5LP 5LP, 2LP xx 623P"
//   "[4]6HP"           → charge ←, then →+HP
//   "j.HK > DRC"       → jump (↑) HK, then a macro name from the active glyph pack
//   "qcf+lp", "down+mk"
import { applyCommand, goesInto, insertRaw, insertTokens, type EditState } from './editor'
import type { GlyphPack, Macro } from './glyphs'
import type { Token } from './tokens'

const NUMPAD: Record<string, Token> = {
  '1': 'downleft', '2': 'down', '3': 'downright', '4': 'left',
  '6': 'right', '7': 'upleft', '8': 'up', '9': 'upright',
}

const NUMPAD_MOTIONS: Record<string, Token> = {
  '236': 'qcf', '214': 'qcb', '623': 'dp', '421': 'rdp',
  '41236': 'hcf', '63214': 'hcb', '360': '360',
}

const BUTTONS: Record<string, Token> = {
  lp: 'lp', mp: 'mp', hp: 'hp', lk: 'lk', mk: 'mk', hk: 'hk',
  p: 'any_p', k: 'any_k', pp: 'any_p', kk: 'any_k', ppp: 'any_p', kkk: 'any_k',
  start: 'start', select: 'select', l3: 'l3', r3: 'r3',
}

const WORD_DIRS = new Set([
  'up', 'down', 'left', 'right', 'upright', 'upleft', 'downright', 'downleft',
  'qcf', 'qcb', 'hcf', 'hcb', 'dp', 'rdp', '360', 'fdp',
])

export type Step = { kind: 'tokens'; tokens: Token[] } | { kind: 'macro'; command: string }

export interface ParseResult {
  steps: Step[]
  /** Pieces of input that couldn't be understood; they are skipped. */
  unknown: string[]
}

/** Splits into steps on ">", ",", "xx", "~" and whitespace. */
function splitSteps(input: string): string[] {
  return input
    .replace(/->/g, '>')
    .split(/\s*(?:>|,|\bxx\b|~)\s*|\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseDirs(chunk: string): Token[] | null {
  // Charge notation: [4] or [2]
  const charge = chunk.match(/^\[([1-9])\]$/)
  if (charge) return NUMPAD[charge[1]] ? [`c_${NUMPAD[charge[1]]}`] : []
  if (/^[1-9]+$/.test(chunk)) {
    if (NUMPAD_MOTIONS[chunk]) return [NUMPAD_MOTIONS[chunk]]
    return [...chunk].filter((d) => d !== '5').map((d) => NUMPAD[d])
  }
  const word = chunk.toLowerCase()
  if (WORD_DIRS.has(word)) return [word === 'fdp' ? 'dp' : word]
  return null
}

function parseButton(chunk: string): Token | null {
  const hold = chunk.match(/^\[(.+)\]$/)
  if (hold) {
    const b = parseButton(hold[1])
    return b ? `h_${b}` : null
  }
  return BUTTONS[chunk.toLowerCase()] ?? null
}

/** Parses one step like "236HP", "2MK", "[4]6HP", "down+mk", "j.HK". */
function parseStep(step: string): Token[] | null {
  let rest = step
  const dirs: Token[] = []

  if (/^j\./i.test(rest)) {
    dirs.push('up')
    rest = rest.slice(2)
  }

  // Leading charge/numpad block: "[4]6", "236", "2"
  const lead = rest.match(/^((?:\[[1-9]\])?[1-9]*)(.*)$/)
  if (lead && lead[1]) {
    const charge = lead[1].match(/^\[([1-9])\]/)
    if (charge) dirs.push(...(parseDirs(charge[0]) ?? []))
    const digits = lead[1].replace(/^\[[1-9]\]/, '')
    if (digits) dirs.push(...(parseDirs(digits) ?? []))
    rest = lead[2]
  }

  const parts = rest.split('+').filter(Boolean)
  const buttons: Token[] = []
  for (const part of parts) {
    const d = parseDirs(part)
    if (d && !buttons.length) {
      dirs.push(...d)
      continue
    }
    const b = parseButton(part)
    if (!b) return null
    buttons.push(b)
  }
  if (!dirs.length && !buttons.length) return null

  const out: Token[] = []
  // Plain numpad sequences like "66" are shown as separate arrows; a direction
  // followed by a button is joined with "+".
  dirs.forEach((d) => out.push(d))
  buttons.forEach((b, i) => {
    if (i > 0 || dirs.length) out.push('plus')
    out.push(b)
  })
  return out
}

export function parseNotation(input: string, macros: Macro[] = []): ParseResult {
  const steps: Step[] = []
  const unknown: string[] = []
  for (const raw of splitSteps(input)) {
    const macro = macros.find((m) => m.name.toLowerCase() === raw.toLowerCase())
    if (macro) {
      steps.push({ kind: 'macro', command: macro.command })
      continue
    }
    const tokens = parseStep(raw)
    if (tokens) steps.push({ kind: 'tokens', tokens })
    else unknown.push(raw)
  }
  return { steps, unknown }
}

/**
 * Inserts parsed notation at the caret. The first step joins the existing combo
 * with the usual context rules; later steps are always separated by "➔".
 */
export function applyNotation(
  s: EditState,
  input: string,
  g: GlyphPack,
  macros: Macro[] = [],
): { state: EditState; unknown: string[] } {
  const { steps, unknown } = parseNotation(input, macros)
  steps.forEach((step, i) => {
    if (i > 0) s = goesInto(s)
    if (step.kind === 'macro') s = applyCommand(s, step.command, g)
    else if (i === 0) s = insertTokens(s, step.tokens, g)
    else for (const t of step.tokens) s = insertRaw(s, t)
  })
  return { state: s, unknown }
}

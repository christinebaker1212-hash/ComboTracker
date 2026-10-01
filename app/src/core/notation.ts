// Turns typed fighting-game notation into combo tokens, so combos can be
// entered by typing instead of clicking. Supports numpad notation and the
// words the app already uses:
//   "2MK > 236HP"      → ↓+MK ➔ QCF+HP
//   "5LP 5LP, 2LP xx 623P"
//   "[4]6HP"           → charge ←, then →+HP
//   "cr.MK", "st.HP"   → ↓+MK, HP
//   "j.HK > DRC"       → "j." note + HK, then a macro name from the active glyph pack
//   "]HP["             → release HP (negative edge)
//   "CH 5HP", "dl.5MP", "\"Drive Rush\"" → notes written into the combo
//   "qcf+lp", "down+mk"
// In styles with their own button names those work too ("2B > 5C" in
// BlazBlue, "236S" in Guilty Gear), and Tekken styles read Tekken notation:
//   "f,n,d,d/f+2", "df+1, 2", "1+2"
import { applyCommand, goesInto, insertRaw, insertTokens, type EditState } from './editor'
import { isAtk, type GlyphPack, type Macro } from './glyphs'
import { INPUT_PROFILES, resolveChord } from './input'
import { note, NEUTRAL, type Token } from './tokens'

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

const NEUTRAL_WORDS = new Set(['n', 'neutral', '5', '★', '☆'])

/** Prefixes written before an attack. "cr." and "st." only say which way the stick is. */
const PREFIX_NOTES: [RegExp, Token | null][] = [
  [/^sj\./i, note('sj.')],
  [/^j\./i, note('j.')],
  [/^dl\./i, note('dl.')],
  [/^(?:cr|c)\./i, 'down'],
  [/^(?:st|s)\./i, null],
]

/** Words that stand alone as a note. */
const NOTE_WORDS: Record<string, string> = {
  ch: 'CH', pc: 'PC', jc: 'jc', sj: 'sj.', dl: 'dl.', delay: 'dl.', dash: 'dash', walk: 'walk',
  microwalk: 'walk', whiff: 'whiff', land: 'land', ws: 'WS', fc: 'FC', ss: 'SS', ssl: 'SSL', ssr: 'SSR',
}

// Tekken notation.
const TEKKEN_DIRS: Record<string, Token> = {
  u: 'up', d: 'down', b: 'left', f: 'right', uf: 'upright', ub: 'upleft', df: 'downright', db: 'downleft',
}
const TEKKEN_BUTTONS: Record<string, Token> = { '1': 'lp', '2': 'mp', '3': 'lk', '4': 'mk' }

export type Step = { kind: 'tokens'; tokens: Token[] } | { kind: 'macro'; command: string }

export interface ParseResult {
  steps: Step[]
  /** Pieces of input that couldn't be understood; they are skipped. */
  unknown: string[]
}

/** Splits into steps on ">", ",", "xx", "~" and whitespace. Text in quotes stays one step. */
function splitSteps(input: string): string[] {
  const out: string[] = []
  const quoted = /"([^"]*)"|“([^”]*)”/g
  let last = 0
  const plain = (s: string) =>
    s
      .replace(/->/g, '>')
      .split(/\s*(?:>|,|\bxx\b|~)\s*|\s+/i)
      .map((x) => x.trim())
      .filter(Boolean)
  for (const m of input.matchAll(quoted)) {
    out.push(...plain(input.slice(last, m.index)))
    const text = (m[1] ?? m[2]).trim()
    if (text) out.push(`"${text}"`)
    last = m.index + m[0].length
  }
  out.push(...plain(input.slice(last)))
  return out
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

/** The style's own name for a button ("C" in BlazBlue, "HS" in Guilty Gear), if it has one. */
function styleButton(chunk: string, g?: GlyphPack): Token | null {
  if (!g?.labels) return null
  const want = chunk.toLowerCase()
  for (const [tok, label] of Object.entries(g.labels)) {
    if (label.toLowerCase() === want && isAtk(tok) && !tok.includes('_') && !/[+ ]/.test(label)) return tok
  }
  return null
}

function parseButton(chunk: string, g?: GlyphPack): Token | null {
  const hold = chunk.match(/^\[(.+)\]$/)
  if (hold) {
    const b = parseButton(hold[1], g)
    return b ? `h_${b}` : null
  }
  const release = chunk.match(/^\](.+)\[$/)
  if (release) {
    const b = parseButton(release[1], g)
    return b && !b.includes('_') ? `r_${b}` : null
  }
  return styleButton(chunk, g) ?? BUTTONS[chunk.toLowerCase()] ?? null
}

/** Joins directions and buttons the way the palette does: "↓+MK", plain "→→" for "66". */
function join(dirs: Token[], buttons: Token[], lead: Token[] = []): Token[] {
  const out: Token[] = [...lead, ...dirs]
  buttons.forEach((b, i) => {
    if (i > 0 || dirs.length) out.push('plus')
    out.push(b)
  })
  return out
}

/** Parses one step like "236HP", "2MK", "[4]6HP", "down+mk", "j.HK", "]HP[". */
function parseStep(step: string, g?: GlyphPack): Token[] | null {
  if (NEUTRAL_WORDS.has(step.toLowerCase())) return [NEUTRAL]
  if (NOTE_WORDS[step.toLowerCase()]) return [note(NOTE_WORDS[step.toLowerCase()])]

  let rest = step
  const lead: Token[] = []
  const dirs: Token[] = []

  for (let changed = true; changed; ) {
    changed = false
    for (const [re, tok] of PREFIX_NOTES) {
      const m = rest.match(re)
      if (!m) continue
      rest = rest.slice(m[0].length)
      if (tok === 'down') dirs.push('down')
      else if (tok) lead.push(tok)
      changed = true
    }
  }

  // Leading charge/numpad block: "[4]6", "236", "2"
  const numpad = rest.match(/^((?:\[[1-9]\])?[1-9]*)(.*)$/)
  if (numpad && numpad[1]) {
    const charge = numpad[1].match(/^\[([1-9])\]/)
    if (charge) dirs.push(...(parseDirs(charge[0]) ?? []))
    const digits = numpad[1].replace(/^\[[1-9]\]/, '')
    if (digits) dirs.push(...(parseDirs(digits) ?? []))
    rest = numpad[2]
  }

  const parts = rest.split('+').filter(Boolean)
  const buttons: Token[] = []
  for (const part of parts) {
    const d = parseDirs(part)
    if (d && !buttons.length) {
      dirs.push(...d)
      continue
    }
    const b = parseButton(part, g)
    if (!b) return null
    buttons.push(b)
  }
  if (!dirs.length && !buttons.length && !lead.length) return null
  return join(dirs, buttons, lead)
}

/**
 * Tekken notation: "d/f+1", "1+2", "f,n,d,df+2", "WS2", "FC df+4".
 * Capital directions are held (Tekken's "B" is holding back).
 */
function parseTekkenStep(step: string, g?: GlyphPack): Token[] | null {
  const lower = step.toLowerCase()
  if (NEUTRAL_WORDS.has(lower)) return [NEUTRAL]
  if (NOTE_WORDS[lower]) return [note(NOTE_WORDS[lower])]
  let rest = step
  const lead: Token[] = []
  const stance = rest.match(/^(ws|fc|ss[lr]?)(?=[\d+udbf])/i)
  if (stance) {
    lead.push(note(stance[1].toUpperCase()))
    rest = rest.slice(stance[1].length)
  }
  const dirs: Token[] = []
  const pressed = new Set<Token>()
  for (const raw of rest.split('+').filter(Boolean)) {
    const part = raw.replace('/', '')
    const dir = TEKKEN_DIRS[part.toLowerCase()]
    if (dir && !pressed.size) {
      dirs.push(part === part.toUpperCase() ? `c_${dir}` : dir)
      continue
    }
    if (/^[1-4]+$/.test(part)) {
      for (const d of part) pressed.add(TEKKEN_BUTTONS[d])
      continue
    }
    const b = parseButton(part, g)
    if (!b) return null
    pressed.add(b)
  }
  if (!dirs.length && !pressed.size && !lead.length) return null
  // 1+2 becomes the 1+2 icon, 2+4 the 2+4 icon, and so on, exactly like pressing them on the controller.
  const buttons = resolveChord(pressed, { ...INPUT_PROFILES.Tekken, ignore: [] }).filter((t) => t !== 'plus')
  return join(dirs, buttons, lead)
}

export function parseNotation(input: string, macros: Macro[] = [], g?: GlyphPack): ParseResult {
  const steps: Step[] = []
  const unknown: string[] = []
  for (const raw of splitSteps(input)) {
    if (raw.startsWith('"')) {
      steps.push({ kind: 'tokens', tokens: [note(raw.slice(1, -1))] })
      continue
    }
    const macro = macros.find((m) => m.name.toLowerCase() === raw.toLowerCase())
    if (macro) {
      steps.push({ kind: 'macro', command: macro.command })
      continue
    }
    const tokens = g?.motionsAreButtons ? parseTekkenStep(raw, g) : parseStep(raw, g)
    if (tokens) steps.push({ kind: 'tokens', tokens })
    else unknown.push(raw)
  }
  return { steps, unknown }
}

/**
 * Inserts parsed notation at the caret. The first step joins the existing combo
 * with the usual context rules. A later step after an attack is separated by
 * "➔"; after a direction or note it simply continues ("f,n,d,d/f+2", "j. HK").
 */
export function applyNotation(
  s: EditState,
  input: string,
  g: GlyphPack,
  macros: Macro[] = [],
): { state: EditState; unknown: string[] } {
  const { steps, unknown } = parseNotation(input, macros, g)
  steps.forEach((step, i) => {
    const prev = s.tokens[(s.cursor ?? s.tokens.length) - 1]
    const afterAttack = i > 0 && prev !== undefined && isAtk(prev, g)
    if (afterAttack) s = goesInto(s)
    if (step.kind === 'macro') s = applyCommand(s, step.command, g)
    else if (afterAttack) for (const t of step.tokens) s = insertRaw(s, t)
    else s = insertTokens(s, step.tokens, g)
  })
  return { state: s, unknown }
}

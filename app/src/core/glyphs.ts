import { ATTACKS, DIRECTIONS, isNote, tokenLabel, type Token } from './tokens'

export interface Macro {
  name: string
  /** Space-separated command string, e.g. "mp+mk+right right". */
  command: string
}

/** Where a user pack gets one icon: borrowed from another pack, or an uploaded image. */
export type GlyphSource = { pack: string } | { image: string }

export interface GlyphPack {
  name: string
  /** Icon filename suffix, e.g. "_ps" loads "lp_ps.png". Empty for the default set. */
  suffix: string
  macros: Macro[]
  /**
   * In Tekken-style packs the motion icons are reused as extra buttons
   * (1+2, 3+4, ...), so they behave as attacks rather than directions.
   */
  motionsAreButtons?: boolean
  /**
   * What each token is called in this style when it isn't the usual LP/MP/...,
   * e.g. Tekken's "1+2" or BlazBlue's "C". Used for tooltips, text fallbacks
   * and typed notation (so "2B" or "d/f+1" work in those styles).
   */
  labels?: Record<string, string>
  /** Tokens drawn with another token's icon, e.g. Tekken's neutral uses the ★ of "360". */
  iconAlias?: Record<string, string>
  /** More icon suffixes to try after the pack's own, e.g. Switch-style arrows for Nintendo. */
  extraSuffixes?: string[]
  /** Built-in pack or one the user created. */
  source: 'builtin' | 'user'
  /** User packs: per-token icon sources. Tokens not listed use the Default pack. */
  tokens?: Record<string, GlyphSource>
  /** User packs: controller mapping, token → buttons like "X" or "LB+RB". */
  mappings?: Record<string, string>
}

/** The file format for user packs (one shareable JSON with images embedded). */
export interface GlyphPackFile {
  name: string
  suffix?: string
  macros?: Macro[] | string[]
  tokens?: Record<string, GlyphSource>
  mappings?: Record<string, string>
}

export function packFromFile(f: GlyphPackFile): GlyphPack {
  const macros = (f.macros ?? []).map((m) => {
    if (typeof m !== 'string') return m
    // The desktop app stored macros as "Name, command".
    const [name, ...rest] = m.split(',')
    return { name: name.trim(), command: rest.join(',').trim() }
  })
  return {
    name: f.name,
    suffix: f.suffix ?? '',
    macros: macros.filter((m) => m.name),
    tokens: f.tokens ?? {},
    mappings: f.mappings ?? {},
    source: 'user',
  }
}

export const packToFile = (g: GlyphPack): GlyphPackFile => ({
  name: g.name,
  suffix: g.suffix,
  macros: g.macros,
  tokens: g.tokens,
  mappings: g.mappings,
})

/** A macro's key for icons, e.g. "Drive Rush" → "drive_rush". */
export const macroCode = (name: string) => name.toLowerCase().trim().replace(/\s+/g, '_')

const SF6_MACROS: Macro[] = [
  { name: 'PDR', command: 'mp+mk right right' },
  { name: 'DRC', command: 'mp+mk' },
  { name: 'DI', command: 'hp+hk' },
  { name: 'Throw', command: 'lp+lk' },
]

// Button names per style, read off each style's icons. Slots follow the
// controller position (top row LP MP HP, bottom row LK MK HK), so a style's
// "LP" is whatever sits top-left in that game.
const TEKKEN_LABELS: Record<string, string> = {
  lp: '1', mp: '2', lk: '3', mk: '4', hp: '1+2', hk: '3+4', any_p: '1+4', any_k: '2+3',
  qcf: '2+4', qcb: '1+3', hcf: '2+3+4', hcb: '1+2+3', dp: '1+3+4', rdp: '1+2+4',
  '360': 'n', neutral: 'n',
  up: 'u', down: 'd', left: 'b', right: 'f', upright: 'u/f', upleft: 'u/b', downright: 'd/f', downleft: 'd/b',
  // Tekken writes held directions in capitals.
  c_up: 'U', c_down: 'D', c_left: 'B', c_right: 'F', c_upright: 'U/F', c_upleft: 'U/B', c_downright: 'D/F', c_downleft: 'D/B',
}
const TEKKEN_ALIAS = { neutral: '360' }
const SC_LABELS = { lp: 'A', mp: 'B', hp: 'a (slide)', lk: 'G', mk: 'K', hk: 'b (slide)', any_p: 'k (slide)', any_k: '★' }
const SNK_LABELS = {
  lp: 'A', mp: 'B', hp: 'Mash', lk: 'C', mk: 'D',
  hk: '632141236', any_p: '641236', any_k: 'Pretzel (1632143)', c_down: '[2]8', c_left: '[4]6',
}
const PAD_LABELS = {
  xbox: { lp: 'X', mp: 'Y', hp: 'RB', lk: 'A', mk: 'B', hk: 'RT', any_p: 'LB', any_k: 'LT', start: 'Menu', select: 'View', l3: 'LS', r3: 'RS' },
  ps: { lp: '□', mp: '△', hp: 'R1', lk: '×', mk: '○', hk: 'R2', any_p: 'L1', any_k: 'L2', start: 'Options', select: 'Share' },
  nintendo: { lp: 'Y', mp: 'X', hp: 'R', lk: 'B', mk: 'A', hk: 'ZR', any_p: 'L', any_k: 'ZL', start: '+', select: '−' },
}

const pack = (
  name: string,
  suffix: string,
  macros: Macro[] = [],
  extra: Partial<GlyphPack> = {},
): GlyphPack => ({ name, suffix, macros, source: 'builtin', ...extra })

export const BUILTIN_GLYPHS: GlyphPack[] = [
  pack('Default', '', SF6_MACROS),
  pack('Classic', '_cl'),
  pack('SuperCombo', '_su'),
  pack('EventHubs', '_hu'),
  pack('Notation', '_np'),
  pack('JP Notation', '_jp'),
  pack('Nintendo', '_nt', SF6_MACROS, { labels: PAD_LABELS.nintendo, extraSuffixes: ['_sw'] }),
  pack('PlayStation', '_ps', SF6_MACROS, { labels: PAD_LABELS.ps }),
  pack('Xbox', '_xb', SF6_MACROS, { labels: PAD_LABELS.xbox }),
  pack('PC', '_kb', SF6_MACROS),
  pack('Modern', '_md', SF6_MACROS, {
    labels: { lp: 'L', lk: 'M', mk: 'H', mp: 'SP', hp: 'N', hk: 'Auto', any_k: 'SA' },
  }),
  pack('EX Plus a', '_ex'),
  pack('Tekken', '_tk', [
    { name: 'EWGF', command: 'right neutral down downright mp' },
    { name: 'RA', command: 'downright hp' },
    { name: 'HB', command: 'any_k' },
  ], { motionsAreButtons: true, labels: TEKKEN_LABELS, iconAlias: TEKKEN_ALIAS }),
  pack('Tekken 3', '_t3', [{ name: 'EWGF', command: 'right neutral down downright mp' }], {
    motionsAreButtons: true, labels: TEKKEN_LABELS, iconAlias: TEKKEN_ALIAS,
  }),
  pack('Soul Calibur', '_sc', [], { labels: SC_LABELS }),
  pack('Guilty Gear', '_gg', [], {
    labels: { lp: 'K', mp: 'S', hp: 'HS', lk: 'P', mk: '(blank)', hk: 'D', any_p: 'K', any_k: 'P' },
  }),
  pack('BlazBlue', '_bb', [], {
    labels: { lp: 'A', mp: 'B', hp: 'AP', lk: 'D', mk: 'C', hk: 'SP', any_p: 'A+B+C', any_k: 'A+B+C+D' },
  }),
  pack('Persona 4', '_p4', [], {
    labels: { lp: 'A', mp: 'C', hp: 'AP', lk: 'B', mk: 'D', hk: 'SP', any_p: 'A+B+C', any_k: 'A+C+D' },
  }),
  pack('FighterZ', '_fz', [], {
    labels: { lp: 'L', mp: 'M', hp: 'A1', lk: 'S', mk: 'H', hk: 'A2', any_p: 'H+S', any_k: 'L+M+H+S' },
  }),
  pack('SNK', '_sk', [], { labels: SNK_LABELS }),
  pack('UMK3', '_m3', [], { labels: { lp: 'HP', mp: 'BL', hp: 'HK', lk: 'LP', mk: 'RUN', hk: 'LK' } }),
  pack('Arcade', '_rt'),
  pack('N64', '_64', [], {
    labels: { lp: 'B', mp: 'C◀', hp: 'C▲', lk: 'A', mk: 'C▼', hk: 'C▶', any_p: 'R', any_k: 'Z' },
  }),
  pack('GameCube', '_gc', [], {
    labels: { lp: 'B', mp: 'Y', hp: 'R', lk: 'A', mk: 'X', hk: 'Z', h_mp: 'C↑', h_lk: 'C←', h_mk: 'C↓', h_hk: 'C→' },
  }),
  pack('Saturn', '_ge', [], { labels: { lp: 'X', mp: 'Y', hp: 'Z', lk: 'A', mk: 'B', hk: 'C' } }),
  pack('Dreamcast', '_dc', [], { labels: { lp: 'X', mp: 'Y', hp: 'R', lk: 'A', mk: 'B', hk: 'L' } }),
]

/** What a token is called in a style: "1+2" in Tekken, "C" in BlazBlue, "LP" by default. */
export function labelFor(token: Token, g?: GlyphPack): string {
  const own = g?.labels?.[token]
  if (own) return own
  const m = token.match(/^([hcr])_(.+)$/)
  const base = m && g?.labels?.[m[2]]
  if (m && base) return m[1] === 'r' ? `]${base}[` : `[${base}]`
  return tokenLabel(token)
}

/** Packs with no macros of their own still get the Drive Rush Cancel shortcut, as before. */
export const macrosFor = (g: GlyphPack): Macro[] =>
  g.macros.length ? g.macros : [{ name: 'DRC', command: 'mp+mk' }]

/** The motion tokens Tekken-style packs reuse as button combinations (360 stays the ★ neutral). */
export const BUTTON_MOTIONS = new Set<string>(['qcb', 'qcf', 'hcb', 'hcf', 'dp', 'rdp'])

export function isDir(tok: Token, g?: GlyphPack): boolean {
  if (g?.motionsAreButtons && BUTTON_MOTIONS.has(tok)) return false
  return DIRECTIONS.has(tok)
}

export function isAtk(tok: Token, g?: GlyphPack): boolean {
  if (g?.motionsAreButtons && BUTTON_MOTIONS.has(tok)) return true
  return ATTACKS.has(tok)
}

/**
 * Resolves which icon file to show for a token in a glyph pack, following the
 * same fallback chain as the original app:
 *   token+suffix(+_2 for Tekken macro art) → PlayStation/Xbox swap → plain token →
 *   for hold/charge tokens, the base token's icon.
 * Returns null when no icon exists and the token should render as text.
 */
export function resolveIcon(
  token: Token,
  g: GlyphPack,
  available: ReadonlySet<string>,
  opts: { macroArt?: boolean; gamepad?: boolean } = {},
): string | null {
  if (isNote(token)) return null
  const t = token.toLowerCase()
  const s = g.source === 'user' ? '' : g.suffix.toLowerCase()
  const alias = g.iconAlias?.[t]
  const candidates: string[] = []
  // Input viewer: controller-shaped art ("lp_tk_gamepad", then "lp_gamepad") where it exists.
  if (opts.gamepad) candidates.push(`${t}${s}_gamepad`, `${t}_gamepad`)
  if (opts.macroArt && (s === '_tk' || s === '_t3')) candidates.push(`${t}${s}_2`)
  for (const suffix of [s, ...(g.extraSuffixes ?? [])]) {
    candidates.push(`${t}${suffix}`)
    if (alias) candidates.push(`${alias}${suffix}`)
  }
  if (s === '_ps') candidates.push(`${t}_xb`)
  if (s === '_xb') candidates.push(`${t}_ps`)
  // Neutral in numpad notation is the "5" icon.
  if (t === 'neutral' && s === '_np') candidates.push('middle_np')
  candidates.push(t)
  for (const c of candidates) if (available.has(c)) return c
  if (/^[chr]_/.test(t)) return resolveIcon(t.slice(2), g, available, opts)
  return null
}

/**
 * Resolves a token to an image URL for any pack. User packs can use uploaded
 * images or borrow icons from built-in packs; anything unset falls back to Default.
 */
export function iconSource(
  token: Token,
  g: GlyphPack,
  available: ReadonlySet<string>,
  iconUrl: (name: string) => string,
  opts: { macroArt?: boolean; gamepad?: boolean } = {},
): string | null {
  if (g.source === 'user') {
    const t = token.toLowerCase()
    const entry = g.tokens?.[t] ?? (/^[chr]_/.test(t) ? g.tokens?.[t.slice(2)] : undefined)
    if (entry && 'image' in entry) return entry.image
    const borrowed = BUILTIN_GLYPHS.find((b) => b.name === (entry && 'pack' in entry ? entry.pack : 'Default'))
    if (borrowed) {
      const name = resolveIcon(token, borrowed, available, opts)
      return name ? iconUrl(name) : null
    }
    return null
  }
  const name = resolveIcon(token, g, available, opts)
  return name ? iconUrl(name) : null
}

/**
 * True when a hold, charge or release token is drawn with its plain icon
 * (no dedicated art), so the UI should add its own marker.
 */
export function needsMarker(token: Token, g: GlyphPack, available: ReadonlySet<string>): boolean {
  const m = token.toLowerCase().match(/^([chr])_/)
  if (!m) return false
  if (g.source === 'user') return !g.tokens?.[token.toLowerCase()]
  const name = resolveIcon(token, g, available)
  return !name || !name.startsWith(`${m[1]}_`)
}

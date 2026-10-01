import { ATTACKS, DIRECTIONS, MOTIONS, type Token } from './tokens'

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
  { name: 'PDR', command: 'mp+mk+right right' },
  { name: 'DRC', command: 'mp+mk' },
]

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
  pack('Nintendo', '_nt', SF6_MACROS),
  pack('PlayStation', '_ps', SF6_MACROS),
  pack('Xbox', '_xb', SF6_MACROS),
  pack('PC', '_kb', SF6_MACROS),
  pack('Modern', '_md', SF6_MACROS),
  pack('EX Plus a', '_ex'),
  pack('Tekken', '_tk', [
    { name: 'EWGF', command: 'right 360 down downright mp' },
    { name: 'RA', command: 'downright hk' },
  ], { motionsAreButtons: true }),
  pack('Tekken 3', '_t3', [{ name: 'EWGF', command: 'right 360 down downright mp' }], {
    motionsAreButtons: true,
  }),
  pack('Soul Calibur', '_sc'),
  pack('Guilty Gear', '_gg'),
  pack('BlazBlue', '_bb'),
  pack('Persona 4', '_p4'),
  pack('FighterZ', '_fz'),
  pack('SNK', '_sk'),
  pack('UMK3', '_m3'),
  pack('Arcade', '_rt'),
  pack('N64', '_64'),
  pack('GameCube', '_gc'),
  pack('Saturn', '_ge'),
  pack('Dreamcast', '_dc'),
]

/** Packs with no macros of their own still get the Drive Rush Cancel shortcut, as before. */
export const macrosFor = (g: GlyphPack): Macro[] =>
  g.macros.length ? g.macros : [{ name: 'DRC', command: 'mp+mk' }]

const MOTION_SET = new Set<string>(MOTIONS)

export function isDir(tok: Token, g?: GlyphPack): boolean {
  if (g?.motionsAreButtons && MOTION_SET.has(tok)) return false
  return DIRECTIONS.has(tok)
}

export function isAtk(tok: Token, g?: GlyphPack): boolean {
  if (g?.motionsAreButtons && MOTION_SET.has(tok)) return true
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
  const t = token.toLowerCase()
  const s = g.source === 'user' ? '' : g.suffix.toLowerCase()
  const candidates: string[] = []
  // Input viewer: controller-shaped art ("lp_tk_gamepad", then "lp_gamepad") where it exists.
  if (opts.gamepad) candidates.push(`${t}${s}_gamepad`, `${t}_gamepad`)
  if (opts.macroArt && (s === '_tk' || s === '_t3')) candidates.push(`${t}${s}_2`)
  candidates.push(`${t}${s}`)
  if (s === '_ps') candidates.push(`${t}_xb`)
  if (s === '_xb') candidates.push(`${t}_ps`)
  candidates.push(t)
  for (const c of candidates) if (available.has(c)) return c
  if (t.startsWith('c_') || t.startsWith('h_')) return resolveIcon(t.slice(2), g, available, opts)
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
    const entry = g.tokens?.[t] ?? (/^[ch]_/.test(t) ? g.tokens?.[t.slice(2)] : undefined)
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

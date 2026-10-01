// Share codes: a combo (or a whole list) as a short text you can paste in chat.
// Format: "CT1:" + base64url(deflate-free compact JSON). Tokens are packed as
// indices into a fixed table so codes stay short.
import {
  BASE_ATTACKS, CARDINALS, CHARGE_DIRS, HOLD_ATTACKS, MOTIONS, NEUTRAL, RELEASE_ATTACKS, SYMBOLS, type Token,
} from './tokens'

// Order matters: codes store positions in this table. New tokens only ever go on the end.
const TABLE: Token[] = [
  ...SYMBOLS, ...BASE_ATTACKS, ...HOLD_ATTACKS, ...CARDINALS, ...CHARGE_DIRS, ...MOTIONS,
  NEUTRAL, ...RELEASE_ATTACKS,
]
const INDEX = new Map(TABLE.map((t, i) => [t, i]))
const PREFIX = 'CT1:'

export interface SharedCombo {
  name: string
  tokens: Token[]
  child?: boolean
}

const toB64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64 = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

/** Tokens → compact base36 string; unknown tokens are kept verbatim after a "~". */
function packTokens(tokens: Token[]): string {
  return tokens.map((t) => (INDEX.has(t) ? INDEX.get(t)!.toString(36).padStart(2, '0') : `~${t}~`)).join('')
}

function unpackTokens(s: string): Token[] {
  const out: Token[] = []
  for (let i = 0; i < s.length; ) {
    if (s[i] === '~') {
      const end = s.indexOf('~', i + 1)
      out.push(s.slice(i + 1, end))
      i = end + 1
    } else {
      const t = TABLE[parseInt(s.slice(i, i + 2), 36)]
      if (t) out.push(t)
      i += 2
    }
  }
  return out
}

export function encodeShare(combos: SharedCombo[], glyph?: string): string {
  const payload = { g: glyph, c: combos.map((c) => [c.name, packTokens(c.tokens), c.child ? 1 : 0]) }
  return PREFIX + toB64(JSON.stringify(payload))
}

export function decodeShare(code: string): { glyph?: string; combos: SharedCombo[] } {
  const trimmed = code.trim()
  const at = trimmed.indexOf(PREFIX)
  if (at < 0) throw new Error("That isn't a ComboTracker share code (they start with CT1:).")
  const body = trimmed.slice(at + PREFIX.length).split(/\s/)[0]
  let data: { g?: string; c: [string, string, number?][] }
  try {
    data = JSON.parse(fromB64(body))
  } catch {
    throw new Error('That share code is incomplete or damaged. Try copying it again.')
  }
  return {
    glyph: data.g,
    combos: (data.c ?? []).map(([name, packed, child]) => ({ name, tokens: unpackTokens(packed), child: !!child })),
  }
}

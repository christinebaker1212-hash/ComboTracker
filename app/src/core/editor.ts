// Pure combo-editing rules, ported from the desktop app. Every function takes
// the current slot state and returns a new one, which makes undo/redo trivial
// and keeps the rules testable without any UI.
import { isAtk, isDir, type GlyphPack } from './glyphs'
import { isNote, MOTION_EXPANSIONS, type Token } from './tokens'

export interface EditState {
  tokens: Token[]
  /** Insert position, or null to append at the end (no visible caret). */
  cursor: number | null
}

const insertPos = (s: EditState) => s.cursor ?? s.tokens.length

function commit(s: EditState, tokens: Token[], pos: number): EditState {
  return { tokens, cursor: s.cursor === null ? null : pos }
}

/**
 * Inserts tokens at the caret, adding the separator the previous token needs:
 * attack → direction or note gets "➔", direction → attack gets "+", attack → attack gets "➔".
 */
export function insertTokens(s: EditState, toInsert: Token[], g?: GlyphPack): EditState {
  if (!toInsert.length) return s
  const tokens = [...s.tokens]
  let pos = insertPos(s)
  if (pos > 0) {
    const prev = tokens[pos - 1]
    const first = toInsert[0]
    // Notes like "j." or "CH" lead into what follows, so they start a new step like a direction.
    if (isDir(first, g) || isNote(first)) {
      if (isAtk(prev, g)) tokens.splice(pos++, 0, 'goes_into')
    } else if (isAtk(first, g)) {
      if (isDir(prev, g)) tokens.splice(pos++, 0, 'plus')
      else if (isAtk(prev, g)) tokens.splice(pos++, 0, 'goes_into')
    }
  }
  tokens.splice(pos, 0, ...toInsert)
  return commit(s, tokens, pos + toInsert.length)
}

const ANY_PK = new Set(['any_p', 'any_k', 'h_any_p', 'h_any_k'])

/** Adds a button press. Repeating Any P / Any K up to 3 times chains them without "➔" (e.g. PPP). */
export function addAttack(s: EditState, key: Token, g?: GlyphPack): EditState {
  key = key.toLowerCase()
  if (isDir(key, g)) return addDirection(s, key, g)
  if (key === 'newline') return insertRaw(s, 'newline')
  const tokens = [...s.tokens]
  let pos = insertPos(s)
  if (pos > 0) {
    const prev = tokens[pos - 1]
    if (isDir(prev, g)) {
      tokens.splice(pos++, 0, 'plus')
    } else if (isAtk(prev, g)) {
      let separate = true
      if (ANY_PK.has(key) && prev === key) {
        let run = 0
        for (let i = pos - 1; i >= 0 && tokens[i] === key; i--) run++
        if (run < 3) separate = false
      }
      if (separate) tokens.splice(pos++, 0, 'goes_into')
    }
  }
  tokens.splice(pos, 0, key)
  return commit(s, tokens, pos + 1)
}

export function addDirection(s: EditState, key: Token, g?: GlyphPack): EditState {
  key = key.toLowerCase()
  if (isAtk(key, g)) return addAttack(s, key, g)
  const tokens = [...s.tokens]
  let pos = insertPos(s)
  if (pos > 0 && isAtk(tokens[pos - 1], g)) tokens.splice(pos++, 0, 'goes_into')
  tokens.splice(pos, 0, key)
  return commit(s, tokens, pos + 1)
}

/** Inserts a token with no automatic separators. */
export function insertRaw(s: EditState, tok: Token): EditState {
  const tokens = [...s.tokens]
  const pos = insertPos(s)
  tokens.splice(pos, 0, tok)
  return commit(s, tokens, pos + 1)
}

/** "+" button: inserts "+", or flips an existing "+"/"➔" right before the caret. */
export function togglePlus(s: EditState): EditState {
  const pos = insertPos(s)
  const prev = s.tokens[pos - 1]
  if (prev === 'goes_into' || prev === 'plus') {
    const tokens = [...s.tokens]
    tokens[pos - 1] = prev === 'goes_into' ? 'plus' : 'goes_into'
    return { ...s, tokens }
  }
  return insertRaw(s, 'plus')
}

/** Inserts "➔", or turns a trailing separator into one. */
export function goesInto(s: EditState): EditState {
  const pos = insertPos(s)
  const prev = s.tokens[pos - 1]
  if (prev === 'goes_into' || prev === 'plus') {
    const tokens = [...s.tokens]
    tokens[pos - 1] = 'goes_into'
    return { ...s, tokens }
  }
  return insertRaw(s, 'goes_into')
}

export function backspace(s: EditState): EditState {
  const pos = insertPos(s)
  if (pos === 0) return s
  const tokens = [...s.tokens]
  tokens.splice(pos - 1, 1)
  return commit(s, tokens, pos - 1)
}

export function deleteForward(s: EditState): EditState {
  if (s.cursor === null || s.cursor >= s.tokens.length) return s
  const tokens = [...s.tokens]
  tokens.splice(s.cursor, 1)
  return { tokens, cursor: s.cursor }
}

export function moveCursor(s: EditState, delta: number): EditState {
  const pos = insertPos(s) + delta
  return { ...s, cursor: Math.max(0, Math.min(s.tokens.length, pos)) }
}

/** Full-motion shortcut buttons (QCF → ↓ ↘ →). */
export function applyMotion(s: EditState, code: string, g?: GlyphPack): EditState {
  const expansion = MOTION_EXPANSIONS[code.toLowerCase()]
  return expansion ? insertTokens(s, expansion, g) : s
}

/**
 * Runs a macro command string such as "mp+mk+right right" or "right 360 down downright mp".
 * "+" toggles plus, "->" or ">" inserts goes-into, everything else is added as a press.
 */
export function applyCommand(s: EditState, command: string, g?: GlyphPack): EditState {
  const parts = command
    .replaceAll('->', ' > ')
    .replaceAll('+', ' + ')
    .replaceAll('>', ' > ')
    .split(/\s+/)
    .filter(Boolean)
  for (const raw of parts) {
    const part = raw.toLowerCase()
    if (part === '+') s = togglePlus(s)
    else if (part === '>' || part === 'goes_into') s = goesInto(s)
    else if (isAtk(part, g)) s = addAttack(s, part, g)
    else if (isDir(part, g)) s = addDirection(s, part, g)
  }
  return s
}

/** Upgrades the most recent occurrence of a token, e.g. "down" → "c_down" once held long enough. */
export function mutateLast(s: EditState, from: Token, to: Token): EditState {
  const i = s.tokens.lastIndexOf(from)
  if (i < 0) return s
  const tokens = [...s.tokens]
  tokens[i] = to
  return { ...s, tokens }
}

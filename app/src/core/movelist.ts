// Command lists ("move lists") for display: sections of moves, each with a
// name, an input and notes. Reads both the generated format (section/notes on
// each slot) and older hand-made lists (notes on extra name lines, "[>]" for
// follow-ups, no sections).
import type { Token } from './tokens'

export interface Move {
  name: string
  tokens: Token[]
  notes: string
  /** A follow-up to the move above it. */
  followUp: boolean
}

export interface MoveSection {
  title: string
  moves: Move[]
}

export interface MoveList {
  glyph?: string
  sections: MoveSection[]
  count: number
}

export function parseMoveList(json: unknown): MoveList {
  const d = (json ?? {}) as { glyph?: string; slots?: { name?: string; tokens?: Token[]; section?: string; notes?: string }[] }
  const sections: MoveSection[] = []
  for (const slot of d.slots ?? []) {
    const lines = (slot.name ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    let name = lines[0] ?? ''
    const followUp = name.startsWith('[>]')
    if (followUp) name = name.slice(3).trim()
    const legacyNotes = lines.slice(1).map((l) => l.replace(/^\((.*)\)$/, '$1')).join(' · ')
    const move: Move = {
      name,
      tokens: Array.isArray(slot.tokens) ? slot.tokens : [],
      notes: slot.notes || legacyNotes,
      followUp,
    }
    if (!move.name && !move.tokens.length) continue
    const title = slot.section || 'Moves'
    let sec = sections.find((s) => s.title === title)
    if (!sec) sections.push((sec = { title, moves: [] }))
    sec.moves.push(move)
  }
  return { glyph: d.glyph, sections, count: sections.reduce((n, s) => n + s.moves.length, 0) }
}

/** Case-insensitive match on a move's name or notes. */
export function filterMoves(list: MoveList, query: string): MoveSection[] {
  const q = query.trim().toLowerCase()
  if (!q) return list.sections
  return list.sections
    .map((s) => ({ ...s, moves: s.moves.filter((m) => m.name.toLowerCase().includes(q) || m.notes.toLowerCase().includes(q)) }))
    .filter((s) => s.moves.length)
}

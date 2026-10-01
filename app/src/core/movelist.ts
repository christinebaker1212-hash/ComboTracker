// Command lists ("move lists") for display: sections of moves, each with a
// name, an input and notes. Reads both the generated format (section/notes on
// each slot) and older hand-made lists (notes on extra name lines, "[>]" for
// follow-ups, no sections).
import type { Token } from './tokens'

/** One row of frame data. Values are numbers, or text like "KD +38" or "21+12". */
export interface FrameRow {
  /** Which version: "LP", "OD", ... (missing when the move has only one). */
  label?: string
  startup?: number | string
  active?: number | string
  recovery?: number | string
  onBlock?: number | string
  onHit?: number | string
  /** Punish counter (SF6). */
  onPC?: number | string
  damage?: number | string
}

export interface Move {
  name: string
  tokens: Token[]
  notes: string
  /** A follow-up to the move above it. */
  followUp: boolean
  frames?: FrameRow[]
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
  const d = (json ?? {}) as { glyph?: string; slots?: { name?: string; tokens?: Token[]; section?: string; notes?: string; frames?: FrameRow[] }[] }
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
      ...(Array.isArray(slot.frames) && slot.frames.length ? { frames: slot.frames } : {}),
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

/** "+4", "-1", "0", or the text as written ("KD +38"). */
export function advantage(v: number | string | undefined): string {
  if (v === undefined) return ''
  if (typeof v === 'number') return v > 0 ? `+${v}` : `${v}`
  return v
}

/** Whether a frame advantage favours you (+), the opponent (−) or neither, for colouring. */
export function advantageSign(v: number | string | undefined): 'plus' | 'minus' | 'even' | null {
  if (typeof v === 'number') return v > 0 ? 'plus' : v < 0 ? 'minus' : 'even'
  if (typeof v !== 'string') return null
  const m = v.match(/^([+-]?\d+)/)
  if (m) return Number(m[1]) > 0 ? 'plus' : Number(m[1]) < 0 ? 'minus' : 'even'
  return /KD|crumple|launch/i.test(v) ? 'plus' : null
}

/** One line for a combo built from a move: "5f startup · -1 on block · +4 on hit". */
export function frameSummary(rows: FrameRow[] | undefined): string | undefined {
  const r = rows?.[0]
  if (!r) return undefined
  const parts = [
    r.startup !== undefined && `${r.startup}f startup`,
    r.onBlock !== undefined && `${advantage(r.onBlock)} on block`,
    r.onHit !== undefined && `${advantage(r.onHit)} on hit`,
  ].filter(Boolean)
  return parts.length ? `${r.label ? `${r.label}: ` : ''}${parts.join(' · ')}` : undefined
}

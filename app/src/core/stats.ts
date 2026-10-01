// Practice history per combo, kept across sessions: how often it was landed,
// the best clean streak, and a per-day tally for the last few weeks.
import type { Token } from './tokens'

export interface ComboStats {
  tries: number
  clean: number
  streak: number
  best: number
  /** YYYY-MM-DD → [tries, clean] */
  days: Record<string, [number, number]>
  last: number
}

export type StatsBook = Record<string, ComboStats>

const DAYS_KEPT = 60

/** Stats follow the inputs, so renaming a combo keeps its history. */
export const statsKey = (tokens: Token[]) => tokens.filter((t) => t !== 'newline').join(' ')

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const emptyStats = (): ComboStats => ({ tries: 0, clean: 0, streak: 0, best: 0, days: {}, last: 0 })

export function recordAttempt(s: ComboStats | undefined, clean: boolean, now = Date.now()): ComboStats {
  const prev = s ?? emptyStats()
  const day = dayKey(now)
  const [t, c] = prev.days[day] ?? [0, 0]
  const days = { ...prev.days, [day]: [t + 1, c + (clean ? 1 : 0)] as [number, number] }
  const keep = Object.keys(days).sort().slice(-DAYS_KEPT)
  const streak = clean ? prev.streak + 1 : 0
  return {
    tries: prev.tries + 1,
    clean: prev.clean + (clean ? 1 : 0),
    streak,
    best: Math.max(prev.best, streak),
    days: Object.fromEntries(keep.map((k) => [k, days[k]])),
    last: now,
  }
}

export const rate = (s: { tries: number; clean: number }) => (s.tries ? Math.round((s.clean / s.tries) * 100) : 0)

/** Today's tally and the last `n` days (oldest first, zeros for days off). */
export function recentDays(s: ComboStats, n = 14, now = Date.now()): { day: string; tries: number; clean: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const day = dayKey(now - (n - 1 - i) * 86_400_000)
    const [tries, clean] = s.days[day] ?? [0, 0]
    return { day, tries, clean }
  })
}

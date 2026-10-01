// Practice history, shared by the practice window (which records) and the
// editor (which shows a success badge on each practised combo).
import { emit, listen } from '@tauri-apps/api/event'
import { create } from 'zustand'
import { recordAttempt, statsKey, type StatsBook } from '../core/stats'
import type { Token } from '../core/tokens'
import { isDesktop } from '../platform'

const KEY = 'combotracker:practice-stats'

function load(): StatsBook {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as StatsBook
  } catch {
    return {}
  }
}

interface StatsState {
  book: StatsBook
  record(tokens: Token[], clean: boolean): void
  reset(tokens: Token[]): void
}

export const useStats = create<StatsState>()((set, get) => {
  const save = (book: StatsBook) => {
    set({ book })
    try {
      localStorage.setItem(KEY, JSON.stringify(book))
    } catch {
      // Stats are a nice-to-have; practice still works without storage.
    }
    if (isDesktop) void emit('stats-changed')
  }
  return {
    book: load(),
    record: (tokens, clean) => {
      const k = statsKey(tokens)
      if (!k) return
      save({ ...get().book, [k]: recordAttempt(get().book[k], clean) })
    },
    reset: (tokens) => {
      const book = { ...get().book }
      delete book[statsKey(tokens)]
      save(book)
    },
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => e.key === KEY && useStats.setState({ book: load() }))
  if (isDesktop) void listen('stats-changed', () => useStats.setState({ book: load() }))
}

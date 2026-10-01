// One-time tips. Only one shows at a time, in a fixed order, and only once
// its feature is on screen; each is remembered once dismissed.
import { create } from 'zustand'

export const TIPS: Record<string, string> = {
  movelist: 'Every character’s moves, like the in-game list. Add any move to your combos in one click.',
  palette: 'Build combos by clicking these, pressing buttons on your controller, or typing notation like 2MK > 236HP.',
  pin: 'Pin a combo to show it on top of your game, then press Overlay.',
  overlay: 'Shows your pinned combos over the game. Lock it so clicks go through to the game.',
  practice: 'Practice mode follows your inputs while you play and tracks how often you land the combo.',
}
const ORDER = Object.keys(TIPS)
const KEY = 'combotracker:tips-seen'

function loadSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

interface TipsState {
  seen: string[]
  mounted: string[]
  mount(id: string): () => void
  dismiss(id: string): void
  reset(): void
}

export const useTips = create<TipsState>()((set, get) => {
  const persist = (seen: string[]) => {
    set({ seen })
    try {
      localStorage.setItem(KEY, JSON.stringify(seen))
    } catch {
      // Tips may show again next launch.
    }
  }
  return {
    seen: loadSeen(),
    mounted: [],
    mount: (id) => {
      set((s) => ({ mounted: [...s.mounted, id] }))
      return () => set((s) => {
        const i = s.mounted.indexOf(id)
        return { mounted: i < 0 ? s.mounted : [...s.mounted.slice(0, i), ...s.mounted.slice(i + 1)] }
      })
    },
    dismiss: (id) => persist([...new Set([...get().seen, id])]),
    reset: () => persist([]),
  }
})

export const activeTip = (s: TipsState) => ORDER.find((id) => s.mounted.includes(id) && !s.seen.includes(id)) ?? null

// Which dialog or panel is open. Kept apart from the combo store so opening
// a dialog never lands in undo history or autosave.
import { create } from 'zustand'

export type Dialog =
  | { kind: 'theme' }
  | { kind: 'glyph'; edit?: string }
  | { kind: 'settings' }
  | { kind: 'layout'; ref?: string }
  | { kind: 'share'; code?: string }
  | { kind: 'savePreset' }
  | { kind: 'help' }
  | { kind: 'moves'; ref?: string }
  | { kind: 'scenes' }
  | { kind: 'setup' }
  | { kind: 'drill' }

interface UIState {
  dialog: Dialog | null
  search: string
  open(d: Dialog): void
  close(): void
  setSearch(q: string): void
}

export const useUI = create<UIState>()((set) => ({
  dialog: null,
  search: '',
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
  setSearch: (search) => set({ search }),
}))

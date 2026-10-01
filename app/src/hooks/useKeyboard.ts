import { useEffect, type RefObject } from 'react'
import { backspace, deleteForward, moveCursor } from '../core/editor'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/**
 * Global shortcuts. Editing keys only apply when you're not typing in a field.
 *   Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y  undo / redo
 *   Ctrl+S                          save the current list
 *   Ctrl+F                          search combos
 *   Backspace / Delete              delete before / after the caret
 *   ← → Home End                    move the caret
 *   ↑ ↓                             select the previous / next combo
 *   / or Enter                      jump to the notation box
 *   Esc                             hide the caret (input appends to the end)
 */
export function useKeyboard(
  notationRef: RefObject<HTMLInputElement | null>,
  searchRef: RefObject<HTMLInputElement | null>,
  onSave: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      // Dialogs handle their own keys; nothing should edit combos behind them.
      if (useUI.getState().dialog) return

      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (isTyping(e.target)) return
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
        return
      }
      if (isTyping(e.target) || mod || e.altKey) return
      if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return

      const list = s.lists[s.player]
      const idx = list.findIndex((c) => c.id === s.selected[s.player])
      const combo = list[idx]
      const hasCaret = s.caret?.id === combo?.id

      switch (e.key) {
        case 'Backspace':
          s.edit(backspace)
          break
        case 'Delete':
          s.edit(deleteForward)
          break
        case 'ArrowLeft':
          s.edit((st) => moveCursor(st, -1))
          break
        case 'ArrowRight':
          s.edit((st) => moveCursor(st, 1))
          break
        case 'Home':
          if (combo) s.setCaret(combo.id, 0)
          break
        case 'End':
          if (combo) s.setCaret(combo.id, combo.tokens.length)
          break
        case 'ArrowUp':
        case 'ArrowDown': {
          const next = list[idx + (e.key === 'ArrowUp' ? -1 : 1)]
          if (next) s.setCaret(next.id, hasCaret ? next.tokens.length : null)
          break
        }
        case 'Escape':
          if (combo) s.setCaret(combo.id, null)
          break
        case '/':
        case 'Enter':
          notationRef.current?.focus()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notationRef, searchRef, onSave])
}

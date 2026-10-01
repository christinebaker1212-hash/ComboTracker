import { Check, ChevronLeft, ChevronRight, Folder } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { MenuItem } from './menuTree'

/**
 * Dropdown with drill-down folders: opening a folder replaces the list with
 * its contents (with a Back row), so nested menus never overflow or overlap.
 */
export function Menu({ trigger, items, title, align = 'left', triggerClassName = 'btn' }: {
  trigger: ReactNode
  items: MenuItem[]
  title?: string
  align?: 'left' | 'right'
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setOpen(false)
    setPath([])
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (path.length) setPath((p) => p.slice(0, -1))
      else close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, path.length])

  // Focus the first entry whenever a level opens, for keyboard users.
  useLayoutEffect(() => {
    if (open) listRef.current?.querySelector<HTMLButtonElement>('.menu-item')?.focus({ preventScroll: true })
  }, [open, path])

  let level = items
  for (const name of path) level = level.find((i) => i.label === name)?.children ?? []

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div className="menu" ref={ref}>
      <button className={triggerClassName} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        {trigger}
      </button>
      {open && (
        <div ref={listRef} className={`menu-list menu-${align}`} role="menu" onKeyDown={onListKey}>
          {path.length > 0 && (
            <button className="menu-item menu-back" role="menuitem" onClick={() => setPath((p) => p.slice(0, -1))}>
              <ChevronLeft size={15} />
              <span>{path.at(-1)}</span>
            </button>
          )}
          {level.length === 0 && <div className="menu-empty">Nothing here yet</div>}
          {level.map((item, i) =>
            item.separator ? (
              <div key={`sep-${i}`} className="menu-sep" role="separator" />
            ) : item.children ? (
              <button
                key={`${item.label}-${i}`}
                className="menu-item"
                role="menuitem"
                aria-haspopup="menu"
                onClick={() => setPath((p) => [...p, item.label])}
              >
                <Folder size={14} className="menu-icon" />
                <span className="menu-label">{item.label}</span>
                <ChevronRight size={15} />
              </button>
            ) : (
              <button
                key={`${item.label}-${i}`}
                className={`menu-item${item.checked ? ' is-checked' : ''}`}
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                onClick={() => {
                  item.onSelect?.()
                  if (!item.keepOpen) close()
                }}
              >
                {item.checked !== undefined && <Check size={14} className="menu-icon menu-check" />}
                {item.icon}
                <span className="menu-label">{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MenuItem } from './menuTree'

function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="menu-list" role="menu">
      {items.map((item) =>
        item.children ? (
          <div
            key={item.label}
            className="menu-sub"
            onMouseEnter={() => setOpen(item.label)}
            onMouseLeave={() => setOpen(null)}
          >
            <button
              className="menu-item"
              role="menuitem"
              aria-haspopup
              aria-expanded={open === item.label}
              onClick={() => setOpen(item.label)}
            >
              <span>{item.label}</span>
              <ChevronRight size={14} />
            </button>
            {open === item.label && <MenuList items={item.children} onClose={onClose} />}
          </div>
        ) : (
          <button
            key={item.label}
            className={`menu-item${item.checked ? ' is-checked' : ''}`}
            role="menuitem"
            onClick={() => {
              item.onSelect?.()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.hint && <span className="menu-hint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}

export function Menu({ trigger, items, title }: { trigger: ReactNode; items: MenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className="btn" title={title} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && <MenuList items={items} onClose={() => setOpen(false)} />}
    </div>
  )
}

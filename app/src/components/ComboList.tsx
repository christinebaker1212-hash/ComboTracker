import {
  Copy, GripVertical, IndentDecrease, IndentIncrease, Pin, Plus, Trash2,
} from 'lucide-react'
import { memo, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { Combo } from '../core/combos'
import { PLAYERS, useStore } from '../store/useStore'
import { TokenView } from './TokenView'

function TokenStrip({ combo, active }: { combo: Combo; active: boolean }) {
  const glyph = useStore((s) => s.glyph)
  const caret = useStore((s) => (s.caret?.id === combo.id ? s.caret.pos : null))
  const setCaret = useStore((s) => s.setCaret)
  const ref = useRef<HTMLDivElement>(null)

  // Keep the caret in view as the combo grows (not on first render, which
  // would scroll the page on load).
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!active) return
    const el = ref.current?.querySelector('.caret') ?? ref.current?.lastElementChild
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, caret, combo.tokens.length])

  const placeCaret = (e: MouseEvent, i: number) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setCaret(combo.id, e.clientX < r.left + r.width / 2 ? i : i + 1)
  }

  const parts: React.ReactNode[] = []
  combo.tokens.forEach((t, i) => {
    if (caret === i) parts.push(<span key="caret" className="caret" />)
    parts.push(
      t === 'newline' ? (
        <span key={i} className="tok-break" onClick={(e) => placeCaret(e, i)}>
          <span className="tok-break-mark">↵</span>
        </span>
      ) : (
        <span key={i} className="tok-slot" onClick={(e) => placeCaret(e, i)}>
          <TokenView token={t} glyph={glyph} />
        </span>
      ),
    )
  })
  if (caret === combo.tokens.length) parts.push(<span key="caret" className="caret" />)

  return (
    <div
      ref={ref}
      className="strip"
      onClick={() => setCaret(combo.id, combo.tokens.length)}
      role="textbox"
      aria-label={`Inputs for ${combo.name}`}
    >
      {parts}
      {!combo.tokens.length && (
        <span className="strip-empty">Click a button, use your controller, or type notation…</span>
      )}
    </div>
  )
}

const ComboRow = memo(function ComboRow({ combo, index, active, dragging, onDragStart, onDropAt }: {
  combo: Combo
  index: number
  active: boolean
  dragging: boolean
  onDragStart: (id: string) => void
  onDropAt: (index: number) => void
}) {
  const select = useStore((s) => s.select)
  const update = useStore((s) => s.updateCombo)
  const duplicate = useStore((s) => s.duplicateCombo)
  const remove = useStore((s) => s.removeCombo)
  const addCombo = useStore((s) => s.addCombo)
  const renaming = useRef(false)
  const [dropHint, setDropHint] = useState<'above' | 'below' | null>(null)

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDropHint(e.clientY < r.top + r.height / 2 ? 'above' : 'below')
  }

  return (
    <li
      className={`row${active ? ' is-active' : ''}${combo.child ? ' is-child' : ''}${dragging ? ' is-dragging' : ''}${dropHint ? ` drop-${dropHint}` : ''}`}
      onMouseDown={() => !active && select(combo.id)}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHint(null)}
      onDrop={(e) => {
        e.preventDefault()
        onDropAt(dropHint === 'below' ? index + 1 : index)
        setDropHint(null)
      }}
    >
      <span
        className="grip"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStart(combo.id)
        }}
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </span>
      <div className="row-body">
        <div className="row-head">
          <input
            className="row-name"
            value={combo.name}
            onFocus={() => (renaming.current = false)}
            onChange={(e) => {
              // One undo step per rename, not per keystroke.
              update(combo.id, { name: e.target.value }, !renaming.current)
              renaming.current = true
            }}
            aria-label="Combo name"
          />
          <div className="row-actions">
            <button
              className={`icon-btn${combo.pinned ? ' is-on' : ''}`}
              title={combo.pinned ? 'Unpin from overlay' : 'Pin to overlay'}
              onClick={() => update(combo.id, { pinned: !combo.pinned })}
            >
              <Pin size={15} fill={combo.pinned ? 'currentColor' : 'none'} />
            </button>
            <button
              className="icon-btn"
              title={combo.child ? 'Outdent' : 'Indent under the combo above'}
              onClick={() => update(combo.id, { child: !combo.child })}
            >
              {combo.child ? <IndentDecrease size={15} /> : <IndentIncrease size={15} />}
            </button>
            <button className="icon-btn" title="Insert combo below" onClick={() => addCombo(combo.id)}>
              <Plus size={15} />
            </button>
            <button className="icon-btn" title="Duplicate" onClick={() => duplicate(combo.id)}>
              <Copy size={15} />
            </button>
            <button className="icon-btn icon-danger" title="Delete combo" onClick={() => remove(combo.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <TokenStrip combo={combo} active={active} />
      </div>
    </li>
  )
})

export function ComboList() {
  const player = useStore((s) => s.player)
  const setPlayer = useStore((s) => s.setPlayer)
  const list = useStore((s) => s.lists[s.player])
  const selected = useStore((s) => s.selected[s.player])
  const addCombo = useStore((s) => s.addCombo)
  const moveCombo = useStore((s) => s.moveCombo)
  const [dragId, setDragId] = useState<string | null>(null)

  const dropAt = (index: number) => {
    if (!dragId) return
    const from = list.findIndex((c) => c.id === dragId)
    moveCombo(dragId, from < index ? index - 1 : index)
    setDragId(null)
  }

  return (
    <section className="combos" aria-label="Combos">
      <div className="combos-head">
        <div className="tabs" role="tablist">
          {PLAYERS.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={player === p}
              className={`tab${player === p ? ' is-active' : ''}`}
              onClick={() => setPlayer(p)}
            >
              Player {p[1]}
            </button>
          ))}
        </div>
        <span className="count">{list.length} combos</span>
      </div>
      <ol className="rows" onDragEnd={() => setDragId(null)}>
        {list.map((c, i) => (
          <ComboRow
            key={c.id}
            combo={c}
            index={i}
            active={c.id === selected}
            dragging={c.id === dragId}
            onDragStart={setDragId}
            onDropAt={dropAt}
          />
        ))}
      </ol>
      <button className="add-row" onClick={() => addCombo()}>
        <Plus size={16} /> New combo
      </button>
    </section>
  )
}

import { ArrowLeft, ChevronDown, ListPlus, Pin, Plus, Search, Target, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeCombo } from '../core/combos'
import { filterMoves, parseMoveList, type Move, type MoveList } from '../core/movelist'
import { openPractice } from '../platform'
import { allGlyphs, allRefs, readPreset, useLibrary } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { TokenView } from './TokenView'
import { CharacterPicker } from './CharacterPicker'
import { entries, initials, type Entry } from '../characters'

const LAST_KEY = 'combotracker:movelist:last'
const lastRef = () => {
  try {
    return localStorage.getItem(LAST_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * In-game style move list: pick a character, read their moves by section,
 * and add any move to your combos, pin it to the overlay, or practise it.
 */
export function MoveListPanel({ initial }: { initial?: string }) {
  const close = useUI((s) => s.close)
  const userGlyphs = useLibrary((s) => s.userGlyphs)
  const glyph = useStore((s) => s.glyph)
  const notify = useStore((s) => s.notify)
  const [refs, setRefs] = useState<Entry[]>([])
  const [ref, setRef] = useState<string | undefined>(initial ?? lastRef())
  const [list, setList] = useState<MoveList | null>(null)
  const [picking, setPicking] = useState(!ref)
  const [q, setQ] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => void allRefs('commandLists').then((r) => setRefs(entries(r))), [])
  useEffect(() => {
    if (!ref) return
    try {
      localStorage.setItem(LAST_KEY, ref)
    } catch {
      // Remembering the last character is a convenience only.
    }
    readPreset('commandLists', ref)
      .then((json) => setList(parseMoveList(json)))
      .catch((e: Error) => notify(e.message, 'error'))
  }, [ref, notify])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (picking && list ? setPicking(false) : close())
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, picking, list])

  const entry = refs.find((e) => e.ref === ref)
  // Show the list in the icon style it was written for, unless the user picked their own.
  const listGlyph = useMemo(() => {
    if (glyph.name !== 'Default' || !list?.glyph) return glyph
    return allGlyphs(userGlyphs).find((g) => g.name === list.glyph) ?? glyph
  }, [glyph, list, userGlyphs])
  const sections = list ? filterMoves(list, q) : []

  const addMove = (m: Move, opts: { pin?: boolean; practice?: boolean } = {}) => {
    const s = useStore.getState()
    const combo = { ...makeCombo(m.name, m.tokens, m.notes || undefined), pinned: !!opts.pin }
    s.appendList([combo])
    if (opts.practice) void openPractice(s.player, combo.id)
    notify(opts.pin ? `Pinned “${m.name}” to the overlay.` : opts.practice ? `Practising “${m.name}”.` : `Added “${m.name}” to your combos.`)
  }

  const useWholeList = () => {
    if (!list) return
    const s = useStore.getState()
    s.replaceList(list.sections.flatMap((sec) => sec.moves.map((m) => ({ ...makeCombo(m.name, m.tokens, m.notes || undefined), child: m.followUp }))))
    useStore.getState().notifyUndo(`Loaded ${entry?.character ?? 'move list'} as your combo list`)
    close()
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="drawer" role="dialog" aria-label="Move list">
        <header className="drawer-head">
          {picking && list ? (
            <button className="icon-btn" onClick={() => setPicking(false)} title="Back to the move list"><ArrowLeft size={18} /></button>
          ) : null}
          <button className="ml-who" onClick={() => setPicking(true)} title="Choose a character">
            {entry ? (
              <>
                <span className="char-avatar">{initials(entry.character)}</span>
                <span className="ml-who-text">
                  <strong>{entry.character}</strong>
                  <span>{entry.game}</span>
                </span>
              </>
            ) : <strong>Choose a character</strong>}
            <ChevronDown size={16} />
          </button>
          <span className="spacer" />
          <button className="icon-btn" onClick={close} title="Close (Esc)"><X size={18} /></button>
        </header>

        {picking || !list ? (
          <CharacterPicker list={refs} current={ref} onPick={(r) => { setRef(r); setPicking(false); setQ('') }} />
        ) : (
          <>
            <div className="ml-tools">
              <div className="ml-search">
                <Search size={15} />
                <input placeholder={`Search ${list.count} moves`} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {list.sections.length > 1 && <nav className="ml-jump" aria-label="Sections">
                {list.sections.map((s) => (
                  <button key={s.title} className="chip-btn" onClick={() => bodyRef.current?.querySelector(`[data-sec="${CSS.escape(s.title)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    {s.title}
                  </button>
                ))}
              </nav>}
            </div>
            <div className="ml-body" ref={bodyRef}>
              {sections.map((sec) => (
                <section key={sec.title} className="ml-section" data-sec={sec.title}>
                  <h3>{sec.title}<span>{sec.moves.length}</span></h3>
                  <ul>
                    {sec.moves.map((m, i) => (
                      <li key={i} className={`ml-move${m.followUp ? ' is-follow' : ''}`}>
                        <div className="ml-move-text">
                          <span className="ml-move-name">{m.name}</span>
                          {m.notes && <span className="ml-move-notes">{m.notes}</span>}
                        </div>
                        <div className="ml-move-input">
                          {m.tokens.map((t, j) => (t === 'newline' ? null : <TokenView key={j} token={t} glyph={listGlyph} size={26} />))}
                        </div>
                        {m.tokens.length > 0 && (
                          <div className="ml-move-actions">
                            <button className="icon-btn" title="Add to my combos" onClick={() => addMove(m)}><Plus size={15} /></button>
                            <button className="icon-btn" title="Pin to the overlay" onClick={() => addMove(m, { pin: true })}><Pin size={15} /></button>
                            <button className="icon-btn" title="Practise it on top of your game" onClick={() => addMove(m, { practice: true })}><Target size={15} /></button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {!sections.length && <p className="empty">No moves match “{q}”.</p>}
            </div>
            <footer className="drawer-foot">
              <button className="btn" onClick={useWholeList} title="Replace your combo list with this whole move list">
                <ListPlus size={15} /> Use as my combo list
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}

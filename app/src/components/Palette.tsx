import { CornerDownLeft, Eraser, Keyboard, Trash2 } from 'lucide-react'
import { forwardRef, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  addAttack, addDirection, applyCommand, applyMotion, insertRaw, insertTokens, togglePlus,
} from '../core/editor'
import { iconUrl, useAssets } from '../assets'
import { iconSource, macroCode, macrosFor } from '../core/glyphs'
import { TIMING } from '../core/input'
import { applyNotation } from '../core/notation'
import { MACRO_TOOLTIPS, type Token } from '../core/tokens'
import { useStore } from '../store/useStore'
import { TokenView } from './TokenView'

/** A palette key: tap to add, hold (like the old app) to add the hold/charge version. */
function PadKey({ token, onTap, onHold, title, children, wide }: {
  token: Token
  onTap: () => void
  onHold?: () => void
  title: string
  children?: ReactNode
  wide?: boolean
}) {
  const glyph = useStore((s) => s.glyph)
  const pressedAt = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    pressedAt.current = performance.now()
    if (onHold) timer.current = setTimeout(() => setHolding(true), TIMING.holdMs)
  }
  const up = (e: PointerEvent) => {
    clearTimeout(timer.current)
    setHolding(false)
    if (pressedAt.current === null) return
    const held = performance.now() - pressedAt.current
    pressedAt.current = null
    const el = e.currentTarget.getBoundingClientRect()
    if (e.clientX < el.left || e.clientX > el.right || e.clientY < el.top || e.clientY > el.bottom) return
    if (onHold && held >= TIMING.holdMs) onHold()
    else onTap()
  }
  const cancel = () => {
    clearTimeout(timer.current)
    setHolding(false)
    pressedAt.current = null
  }

  return (
    <button
      className={`pad-key${wide ? ' pad-key-wide' : ''}${holding ? ' is-holding' : ''}`}
      title={title}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={cancel}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTap())}
    >
      {children ?? <TokenView token={token} glyph={glyph} size={30} />}
    </button>
  )
}

/** Shows what typed notation will add, so mistakes are visible before pressing Enter. */
function NotationPreview({ text }: { text: string }) {
  const glyph = useStore((s) => s.glyph)
  const { state, unknown } = applyNotation({ tokens: [], cursor: null }, text, glyph, macrosFor(glyph))
  return (
    <div className="notation-preview" aria-live="polite">
      {state.tokens.map((t, i) => (t === 'newline' ? null : <TokenView key={i} token={t} glyph={glyph} size={22} />))}
      {unknown.length > 0 && <span className="notation-unknown">Not understood: {unknown.join(', ')}</span>}
    </div>
  )
}

const ATTACK_ROWS: Token[][] = [
  ['lp', 'mp', 'hp', 'any_p'],
  ['lk', 'mk', 'hk', 'any_k'],
]

const DPAD: (Token | null)[] = ['upleft', 'up', 'upright', 'left', null, 'right', 'downleft', 'down', 'downright']
const MOTION_KEYS: Token[] = ['qcb', 'qcf', 'hcb', 'hcf', 'rdp', 'dp', '360']
const FULL_MOTIONS = [
  ['QCB', 'qcb'], ['QCF', 'qcf'], ['HCB', 'hcb'], ['HCF', 'hcf'], ['RDP', 'rdp'], ['DP', 'dp'],
] as const

export const Palette = forwardRef<HTMLInputElement>(function Palette(_, notationRef) {
  const edit = useStore((s) => s.edit)
  const glyph = useStore((s) => s.glyph)
  const selectedId = useStore((s) => s.selected[s.player])
  const clearCombo = useStore((s) => s.clearCombo)
  const clearAll = useStore((s) => s.clearAll)
  const notify = useStore((s) => s.notify)
  const [text, setText] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const macros = macrosFor(glyph)
  const { icons } = useAssets()

  const submitNotation = () => {
    if (!text.trim()) return
    let unknown: string[] = []
    edit((s, g) => {
      const r = applyNotation(s, text, g, macros)
      unknown = r.unknown
      return r.state
    })
    if (unknown.length) notify(`Skipped: ${unknown.join(', ')}`, 'error')
    setText('')
  }

  return (
    <aside className="palette" aria-label="Input palette">
      <section className="panel">
        <header className="panel-head">
          <h2>Type it</h2>
          <span className="panel-hint"><Keyboard size={13} /> numpad or words</span>
        </header>
        <form
          className="notation"
          onSubmit={(e) => {
            e.preventDefault()
            submitNotation()
          }}
        >
          <input
            ref={notationRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="2MK > 236HP"
            aria-label="Type combo notation"
            spellCheck={false}
          />
          <button className="btn btn-accent" type="submit" disabled={!text.trim()}>Add</button>
        </form>
        {text.trim() && <NotationPreview text={text} />}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Attacks</h2>
          <span className="panel-hint">hold for [H]</span>
        </header>
        <div className="attack-grid">
          {ATTACK_ROWS.flat().map((t) => (
            <PadKey
              key={t}
              token={t}
              title={`${t.toUpperCase()} — hold for a held press`}
              onTap={() => edit((s, g) => addAttack(s, t, g))}
              onHold={() => edit((s, g) => addAttack(s, `h_${t}`, g))}
            />
          ))}
          <PadKey token="plus" title="+ (press again to switch to ➔)" onTap={() => edit((s) => togglePlus(s))} />
          <PadKey token="goes_into" title="➔ goes into" onTap={() => edit((s) => insertRaw(s, 'goes_into'))} />
          <PadKey token="newline" title="New line" onTap={() => edit((s) => insertRaw(s, 'newline'))}>
            <CornerDownLeft size={20} />
          </PadKey>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Directions</h2>
          <span className="panel-hint">hold for charge</span>
        </header>
        <div className="dir-area">
          <div className="dpad">
            {DPAD.map((t, i) =>
              t ? (
                <PadKey
                  key={t}
                  token={t}
                  title={`${t} — hold for charge`}
                  onTap={() => edit((s, g) => addDirection(s, t, g))}
                  onHold={() => edit((s, g) => addDirection(s, `c_${t}`, g))}
                />
              ) : (
                <span key={i} className="dpad-center" />
              ),
            )}
          </div>
          <div className="motion-grid">
            {MOTION_KEYS.map((t) => (
              <PadKey
                key={t}
                token={t}
                title={`${t.toUpperCase()} as a single icon`}
                onTap={() => edit((s, g) => insertTokens(s, [t], g))}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Shortcuts</h2>
          <span className="panel-hint">writes the full input</span>
        </header>
        <div className="macro-grid">
          {macros.map((m) => (
            <button
              key={m.name}
              className="chip-btn"
              title={`${MACRO_TOOLTIPS[m.name.toUpperCase()] ?? m.name}: ${m.command}`}
              onClick={() => edit((s, g) => applyCommand(s, m.command, g))}
            >
              {iconSource(macroCode(m.name), glyph, icons, iconUrl) && (
                <TokenView token={macroCode(m.name)} glyph={glyph} size={18} />
              )}
              {m.name}
            </button>
          ))}
          {FULL_MOTIONS.map(([label, code]) => (
            <button
              key={code}
              className="chip-btn"
              title={MACRO_TOOLTIPS[label]}
              onClick={() => edit((s, g) => applyMotion(s, code, g))}
            >
              <TokenView token={code} glyph={glyph} size={18} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel panel-row">
        <button className="btn" onClick={() => clearCombo(selectedId)} title="Clear the selected combo (undo with Ctrl+Z)">
          <Eraser size={15} /> Clear combo
        </button>
        {confirmClear ? (
          <span className="confirm">
            <button className="btn btn-danger" onClick={() => (clearAll(), setConfirmClear(false))}>Clear every combo</button>
            <button className="btn" onClick={() => setConfirmClear(false)}>Cancel</button>
          </span>
        ) : (
          <button className="btn" onClick={() => setConfirmClear(true)} title="Clear every combo for this player">
            <Trash2 size={15} /> Clear all
          </button>
        )}
      </section>
    </aside>
  )
})

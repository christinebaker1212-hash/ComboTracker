import { CornerDownLeft, Eraser, Keyboard, Trash2 } from 'lucide-react'
import { forwardRef, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  addAttack, addDirection, applyCommand, applyMotion, insertRaw, insertTokens, togglePlus,
} from '../core/editor'
import { iconUrl, useAssets } from '../assets'
import { iconSource, labelFor, macroCode, macrosFor, type GlyphPack } from '../core/glyphs'
import { TIMING } from '../core/input'
import { applyNotation } from '../core/notation'
import { MACRO_TOOLTIPS, NEUTRAL, note, QUICK_NOTES, type Token } from '../core/tokens'
import { useStore } from '../store/useStore'
import { Tip } from './Tip'
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
// Tekken styles: the four buttons, then every combination the icons draw (the
// motion slots are 2+4, 1+3 and so on in these styles).
const TEKKEN_ROWS: Token[][] = [
  ['lp', 'mp', 'lk', 'mk'],
  ['hp', 'hk', 'qcb', 'qcf'],
  ['any_p', 'any_k', 'hcb', 'hcf'],
  ['rdp', 'dp'],
]

const DPAD: Token[] = ['upleft', 'up', 'upright', 'left', NEUTRAL, 'right', 'downleft', 'down', 'downright']
const MOTION_KEYS: Token[] = ['qcb', 'qcf', 'hcb', 'hcf', 'rdp', 'dp', '360']
const FULL_MOTIONS = [
  ['QCB', 'qcb', 'qcb'], ['QCF', 'qcf', 'qcf'], ['HCB', 'hcb', 'hcb'], ['HCF', 'hcf', 'hcf'], ['RDP', 'rdp', 'rdp'], ['DP', 'dp', 'dp'],
  ['QCF×2', 'qcf2', 'qcf'], ['QCB×2', 'qcb2', 'qcb'],
] as const

/** How the next button press is written: a tap, a held press [HP], or a release ]HP[. */
type PressMode = 'tap' | 'hold' | 'release'
const MODE_HINT: Record<PressMode, string> = {
  tap: 'hold a key for [H]',
  hold: 'next press is held',
  release: 'next press is a release',
}

const withMode = (t: Token, mode: PressMode) => (mode === 'hold' ? `h_${t}` : mode === 'release' ? `r_${t}` : t)

/** Tooltip for a palette key in the current style: "1+2 (HP slot)" reads oddly, so just the name. */
const keyTitle = (t: Token, g: GlyphPack, extra: string) => `${labelFor(t, g)}${extra ? ` — ${extra}` : ''}`

export const Palette = forwardRef<HTMLInputElement>(function Palette(_, notationRef) {
  const edit = useStore((s) => s.edit)
  const glyph = useStore((s) => s.glyph)
  const selectedId = useStore((s) => s.selected[s.player])
  const clearCombo = useStore((s) => s.clearCombo)
  const clearAll = useStore((s) => s.clearAll)
  const notify = useStore((s) => s.notify)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<PressMode>('tap')

  const macros = macrosFor(glyph)
  const { icons } = useAssets()
  const tekken = !!glyph.motionsAreButtons
  // Releases only make sense for the main attack buttons.
  const releasable = (t: Token) => !['qcb', 'qcf', 'hcb', 'hcf', 'dp', 'rdp'].includes(t) || !tekken

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

  /** Adds a button in the chosen press mode; hold/release apply to one press, then it's back to tap. */
  const press = (t: Token, forced?: PressMode) => {
    const m = forced ?? (mode === 'release' && !releasable(t) ? 'tap' : mode)
    edit((s, g) => addAttack(s, withMode(t, m), g))
    if (mode !== 'tap') setMode('tap')
  }

  return (
    <aside className="palette" aria-label="Input palette">
      <section className="panel">
        <header className="panel-head">
          <Tip id="palette"><h2>Type it</h2></Tip>
          <span className="panel-hint"><Keyboard size={13} /> {tekken ? 'd/f+1, 2' : 'numpad or words'}</span>
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
            placeholder={tekken ? 'f,n,d,d/f+2' : '2MK > 236HP'}
            aria-label="Type combo notation"
            title={'Steps split by spaces, > , or xx. [HP] holds, ]HP[ releases, j. CH dl. are notes, "any text" adds a note.'}
            spellCheck={false}
          />
          <button className="btn btn-accent" type="submit" disabled={!text.trim()}>Add</button>
        </form>
        {text.trim() && <NotationPreview text={text} />}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Attacks</h2>
          <span className="panel-hint">{MODE_HINT[mode]}</span>
        </header>
        <div className="segmented press-mode" role="radiogroup" aria-label="Next press">
          {(['tap', 'hold', 'release'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? 'is-active' : ''}
              onClick={() => setMode(mode === m ? 'tap' : m)}
              title={
                m === 'tap' ? 'Normal press'
                  : m === 'hold' ? 'Held press, written [HP] (or hold the key down)'
                    : 'Release a held button, written ]HP[ (negative edge)'
              }
            >
              {m === 'tap' ? 'Press' : m === 'hold' ? 'Hold' : 'Release'}
            </button>
          ))}
        </div>
        <div className="attack-grid">
          {(tekken ? TEKKEN_ROWS : ATTACK_ROWS).flat().map((t) => (
            <PadKey
              key={t}
              token={withMode(t, mode === 'release' && !releasable(t) ? 'tap' : mode)}
              title={keyTitle(t, glyph, 'hold for a held press')}
              onTap={() => press(t)}
              onHold={() => press(t, 'hold')}
            />
          ))}
        </div>
        <div className="sep-grid">
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
          <span className="panel-hint">hold for charge · middle is neutral</span>
        </header>
        <div className="dir-area">
          <div className="dpad">
            {DPAD.map((t) =>
              t === NEUTRAL ? (
                <PadKey
                  key={t}
                  token={t}
                  title={`${labelFor(t, glyph)} — neutral: let the stick return to the middle (as in f,n,d,d/f)`}
                  onTap={() => edit((s, g) => addDirection(s, t, g))}
                />
              ) : (
                <PadKey
                  key={t}
                  token={t}
                  title={keyTitle(t, glyph, 'hold for charge')}
                  onTap={() => edit((s, g) => addDirection(s, t, g))}
                  onHold={() => edit((s, g) => addDirection(s, `c_${t}`, g))}
                />
              ),
            )}
          </div>
          {!tekken && (
            <div className="motion-grid">
              {MOTION_KEYS.map((t) => (
                <PadKey
                  key={t}
                  token={t}
                  title={`${labelFor(t, glyph)} as a single icon`}
                  onTap={() => edit((s, g) => insertTokens(s, [t], g))}
                />
              ))}
            </div>
          )}
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
          {FULL_MOTIONS.map(([label, code, icon]) => (
            <button
              key={code}
              className="chip-btn"
              title={MACRO_TOOLTIPS[label]}
              onClick={() => edit((s, g) => applyMotion(s, code, g))}
            >
              {/* Tekken styles draw motions with their arrow art, not the button-combo icons. */}
              <TokenView token={icon} glyph={glyph} size={18} macroArt />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Notes</h2>
          <span className="panel-hint">or type "any text"</span>
        </header>
        <div className="macro-grid">
          {QUICK_NOTES.map(([label, meaning]) => (
            <button
              key={label}
              className="chip-btn chip-note"
              title={meaning}
              onClick={() => edit((s, g) => insertTokens(s, [note(label)], g))}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel panel-row">
        <button className="btn" onClick={() => clearCombo(selectedId)} title="Clear the selected combo (you can undo it)">
          <Eraser size={15} /> Clear combo
        </button>
        <button className="btn" onClick={clearAll} title="Clear every combo for this player (you can undo it)">
          <Trash2 size={15} /> Clear all
        </button>
      </section>
    </aside>
  )
})

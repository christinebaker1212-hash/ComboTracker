import { Gamepad2, RotateCcw, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { connectedPads } from '../core/input'
import { feedPractice, startPractice, stepsFor, toFrames } from '../core/practice'
import { tokenLabel } from '../core/tokens'
import { inputBus } from '../inputBus'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { TokenView } from './TokenView'
import { Modal, Segmented } from './ui'

export function PracticePanel({ comboId }: { comboId: string }) {
  const close = useUI((s) => s.close)
  const combo = useStore((s) => s.lists[s.player].find((c) => c.id === comboId))
  const glyph = useStore((s) => s.glyph)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const steps = useMemo(() => stepsFor(combo?.tokens ?? [], side === 'right'), [combo?.tokens, side])
  const [state, setState] = useState(() => startPractice(steps))
  const [hasPad, setHasPad] = useState(() => connectedPads().length > 0)


  useEffect(() => {
    const onPad = () => setHasPad(connectedPads().length > 0)
    window.addEventListener('gamepadconnected', onPad)
    window.addEventListener('gamepaddisconnected', onPad)
    // capture: while practising, the controller doesn't type into combos.
    const un = inputBus.subscribe((ev, time) => {
      if (ev.type !== 'insert') return
      setState((s) => ev.tokens.reduce((acc, t) => feedPractice(acc, t, time), s))
    }, true)
    return () => {
      un()
      window.removeEventListener('gamepadconnected', onPad)
      window.removeEventListener('gamepaddisconnected', onPad)
    }
  }, [])

  if (!combo) return null
  const doneSources = new Set(steps.slice(0, state.index).map((s) => s.source))
  const current = steps[state.index]
  const gaps = state.hitTimes.slice(1).map((t, i) => toFrames(t - state.hitTimes[i]))

  return (
    <Modal
      title={`Practice: ${combo.name || 'Untitled combo'}`}
      subtitle="Perform the combo on your controller. Each input lights up as you hit it."
      onClose={close}
      wide
      footer={
        <>
          <button className="btn" onClick={() => setState(startPractice(steps, state))}><RotateCcw size={14} /> Restart</button>
          <span className="spacer" />
          <button className="btn btn-accent" onClick={close}>Done</button>
        </>
      }
    >
      <div className="practice-top">
        <Segmented
          label="Your side"
          value={side}
          onChange={(v) => {
            setSide(v)
            setState((s) => startPractice(stepsFor(combo.tokens, v === 'right'), s))
          }}
          options={[
            { value: 'left', label: 'Player 1 side', hint: 'Facing right, as written' },
            { value: 'right', label: 'Player 2 side', hint: 'Facing left: left and right are swapped' },
          ]}
        />
        <div className="practice-stats">
          <span><Trophy size={14} /> {state.completions} clean</span>
          <span>Best {state.best}/{steps.length}</span>
        </div>
      </div>

      {!steps.length ? (
        <p className="notice">This combo is empty. Add some inputs first.</p>
      ) : (
        <>
          <div className="practice-tokens">
            {combo.tokens.map((t, i) =>
              t === 'newline' ? <span key={i} className="tok-break" /> : (
                <span key={i} className={`practice-tok${doneSources.has(i) ? ' is-done' : ''}${current?.source === i ? ' is-current' : ''}`}>
                  <TokenView token={t} glyph={glyph} size={40} />
                </span>
              ),
            )}
          </div>
          <div className="practice-bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={state.index}>
            <span style={{ width: `${(state.index / steps.length) * 100}%` }} />
          </div>
          <div className={`practice-status${state.mistake ? ' is-miss' : ''}`} aria-live="polite">
            {state.mistake
              ? `Dropped at step ${state.mistake.at + 1}: expected ${tokenLabel(state.mistake.expected)}, got ${tokenLabel(state.mistake.got)}. Start again from the top.`
              : state.index === 0 && state.completions
                ? 'Clean! Go again.'
                : `Next: ${current ? tokenLabel(current.token) : ''}`}
          </div>
          {gaps.length > 0 && (
            <p className="field-hint">Gaps between inputs (frames at 60 fps): {gaps.join(' · ')}</p>
          )}
        </>
      )}

      {!hasPad && (
        <p className="notice"><Gamepad2 size={16} /> Connect a controller and press any button to start practising.</p>
      )}
    </Modal>
  )
}

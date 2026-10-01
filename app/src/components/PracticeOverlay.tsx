import { ArrowLeftRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feedPractice, startPractice, stepsFor, toFrames } from '../core/practice'
import { tokenLabel } from '../core/tokens'
import { usePadEvents } from '../hooks/usePadEvents'
import { useShared } from '../hooks/useShared'
import { onPracticeRestart, PRACTICE_HEARTBEAT_KEY } from '../platform'
import { rate, recentDays, statsKey, type ComboStats } from '../core/stats'
import { useStats } from '../store/useStats'
import type { Player } from '../store/useStore'
import { FloatingShell } from './Floating'
import { TokenView } from './TokenView'

/** Today, all-time and best streak, with a 14-day bar chart. */
function PracticeHistory({ stats }: { stats: ComboStats }) {
  const days = recentDays(stats, 14)
  const today = days[days.length - 1]
  const peak = Math.max(1, ...days.map((d) => d.tries))
  return (
    <div className="practice-history">
      <span>Today {today.clean}/{today.tries}</span>
      <span>All time {rate(stats)}%</span>
      <span>Best streak {stats.best}</span>
      <span className="practice-spark" title="Last 14 days: bar height is attempts, filled part is clean">
        {days.map((d) => (
          <i key={d.day} style={{ height: `${(d.tries / peak) * 100}%` }} title={`${d.day}: ${d.clean}/${d.tries}`}>
            <b style={{ height: d.tries ? `${(d.clean / d.tries) * 100}%` : 0 }} />
          </i>
        ))}
      </span>
    </div>
  )
}

/**
 * Practice mode as a floating, always-on-top window: play the combo in your
 * game and watch each input light up. Reads the controller itself, so it works
 * while the game has focus.
 */
export function PracticeOverlay({ player, comboId }: { player: Player; comboId: string }) {
  const { lists, glyph, theme, settings } = useShared()
  const combo = lists[player]?.find((c) => c.id === comboId)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const steps = useMemo(() => stepsFor(combo?.tokens ?? [], side === 'right'), [combo?.tokens, side])
  const [state, setState] = useState(() => startPractice(steps))
  const [stepsKey, setStepsKey] = useState(steps)
  if (stepsKey !== steps) {
    // Combo edited in the main window or side switched: start over.
    setStepsKey(steps)
    setState((s) => startPractice(steps, s))
  }

  usePadEvents(settings.padIndex, glyph, (ev, time) => {
    if (ev.type === 'insert') setState((s) => ev.tokens.reduce((acc, t) => feedPractice(acc, t, time), s))
  })

  // Record each landed combo and each drop in the long-term practice history.
  const record = useStats((s) => s.record)
  const stats = useStats((s) => (combo ? s.book[statsKey(combo.tokens)] : undefined))
  const counted = useRef({ completions: state.completions, drops: state.drops })
  useEffect(() => {
    const prev = counted.current
    counted.current = { completions: state.completions, drops: state.drops }
    if (!combo) return
    for (let i = prev.completions; i < state.completions; i++) record(combo.tokens, true)
    for (let i = prev.drops; i < state.drops; i++) record(combo.tokens, false)
  }, [state.completions, state.drops, combo, record])

  // Global hotkey from the main window: restart.
  useEffect(() => onPracticeRestart(() => setState((s) => startPractice(s.steps, s))), [])

  // Tell the editor window not to type controller input into combos meanwhile.
  useEffect(() => {
    const beat = () => {
      try {
        localStorage.setItem(PRACTICE_HEARTBEAT_KEY, String(Date.now()))
      } catch {
        // Worst case the editor also records the inputs; Ctrl+Z undoes them.
      }
    }
    beat()
    const t = setInterval(beat, 500)
    return () => clearInterval(t)
  }, [])

  const doneSources = new Set(steps.slice(0, state.index).map((s) => s.source))
  const current = steps[state.index]
  const gaps = state.hitTimes.slice(1).map((t, i) => toFrames(t - state.hitTimes[i]))

  return (
    <FloatingShell
      prefKey={`combotracker:practice:${player}`}
      title={`Practice · ${combo?.name ?? 'Combo'}`}
      theme={theme}
      defaults={{ backdrop: 'dark' }}
      extraTools={
        <>
          <button className="icon-btn" onClick={() => setState(startPractice(steps, state))} title="Restart"><RotateCcw size={14} /></button>
          <button className={`icon-btn${side === 'right' ? ' is-on' : ''}`} onClick={() => setSide((s) => (s === 'left' ? 'right' : 'left'))}
            title={side === 'left' ? 'Playing on the left (P1 side). Click if you are on the right' : 'Playing on the right (P2 side): left and right are swapped'}>
            <ArrowLeftRight size={14} />
          </button>
        </>
      }
    >
      {(scale) => {
        const size = Math.round(34 * scale)
        if (!combo) return <p className="overlay-empty">This combo was deleted.</p>
        if (!steps.length) return <p className="overlay-empty">This combo is empty.</p>
        return (
          <div className="practice-overlay" style={{ fontSize: Math.max(12, size * 0.4) }}>
            <div className="practice-head">
              <strong>{combo.name || 'Practice'}</strong>
              <span>✔ {state.completions}{side === 'right' ? ' · P2 side' : ''}</span>
            </div>
            <div className="overlay-tokens">
              {combo.tokens.map((t, i) =>
                t === 'newline' ? <span key={i} className="tok-break" /> : (
                  <span key={i} className={`practice-tok${doneSources.has(i) ? ' is-done' : ''}${current?.source === i ? ' is-current' : ''}`}>
                    <TokenView token={t} glyph={glyph} size={size} />
                  </span>
                ),
              )}
            </div>
            <div className="practice-bar"><span style={{ width: `${(state.index / steps.length) * 100}%` }} /></div>
            <div className={`practice-status${state.mistake ? ' is-miss' : ''}`}>
              {state.mistake
                ? `Dropped: expected ${tokenLabel(state.mistake.expected)}, got ${tokenLabel(state.mistake.got)}`
                : state.index === 0 && state.completions ? 'Clean! Go again.' : `Next: ${current ? tokenLabel(current.token) : ''}`}
            </div>
            {gaps.length > 0 && <div className="practice-gaps">Frames between inputs: {gaps.join(' · ')}</div>}
            {stats && <PracticeHistory stats={stats} />}
          </div>
        )
      }}
    </FloatingShell>
  )
}

import { ArrowLeftRight, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buttonGaps, buttonSteps, feedPractice, judge, referenceFits, startPractice, stepsFor, type PracticeState,
} from '../core/practice'
import { labelFor } from '../core/glyphs'
import { usePadEvents } from '../hooks/usePadEvents'
import { useShared } from '../hooks/useShared'
import { onPracticeRestart, PRACTICE_HEARTBEAT_KEY, sendToMain } from '../platform'
import { sounds } from '../sounds'
import type { Combo } from '../core/combos'
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

const SOUND_KEY = 'combotracker:practice:sound'
const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1])

/** What a drill run asks for: these combos, each landed `reps` times clean. */
export interface Drill {
  ids: string[]
  reps: number
  shuffled: boolean
}

interface DrillResult { id: string; name: string; tries: number; clean: number }

/**
 * Practice mode as a floating, always-on-top window: play the combo in your
 * game and watch each input light up. Reads the controller itself, so it works
 * while the game has focus. With a drill, works through several combos in turn
 * and ends with a summary.
 */
export function PracticeOverlay({ player, comboId, drill }: { player: Player; comboId: string; drill?: Drill }) {
  const { lists, theme } = useShared()
  const [order, setOrder] = useState(() => (drill ? (drill.shuffled ? shuffle(drill.ids) : drill.ids) : [comboId]))
  const [at, setAt] = useState(0)
  const [results, setResults] = useState<DrillResult[]>([])
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const toggleSound = () =>
    setSound((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? 'off' : 'on')
      } catch {
        // Harmless.
      }
      return !v
    })

  const list = lists[player] ?? []
  const combo = list.find((c) => c.id === order[at])
  const finished = !!drill && at >= order.length

  const onComboDone = (tries: number, clean: number) => {
    if (!combo) return
    setResults((r) => [...r, { id: combo.id, name: combo.name, tries, clean }])
    setAt((i) => i + 1)
  }

  const soundButton = (
    <button className={`icon-btn${sound ? ' is-on' : ''}`} onClick={toggleSound} title={sound ? 'Sounds on: tick, chime, buzz' : 'Sounds off'}>
      {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </button>
  )

  if (finished) {
    return (
      <FloatingShell prefKey={`combotracker:practice:${player}`} title="Drill finished" theme={theme} defaults={{ backdrop: 'dark' }} extraTools={soundButton}>
        {() => (
          <div className="practice-overlay">
            <div className="practice-head"><strong>Drill finished</strong></div>
            <table className="drill-summary">
              <thead><tr><th>Combo</th><th>Clean</th><th>Tries</th><th>Rate</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || 'Combo'}</td><td>{r.clean}</td><td>{r.tries}</td>
                    <td>{r.tries ? Math.round((r.clean / r.tries) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="btn btn-small"
              onClick={() => {
                setOrder(drill!.shuffled ? shuffle(drill!.ids) : drill!.ids)
                setResults([])
                setAt(0)
              }}
            >
              <RotateCcw size={13} /> Run it again
            </button>
          </div>
        )}
      </FloatingShell>
    )
  }

  return (
    <PracticeSession
      key={combo?.id ?? 'none'}
      player={player}
      combo={combo}
      sound={sound}
      soundButton={soundButton}
      drill={drill ? { index: at, total: order.length, reps: drill.reps, onDone: onComboDone } : undefined}
    />
  )
}

function PracticeSession({ player, combo, sound, soundButton, drill }: {
  player: Player
  combo: Combo | undefined
  sound: boolean
  soundButton: React.ReactNode
  drill?: { index: number; total: number; reps: number; onDone: (tries: number, clean: number) => void }
}) {
  const { glyph, theme, settings } = useShared()
  const [side, setSide] = useState<'left' | 'right'>('left')
  const steps = useMemo(() => stepsFor(combo?.tokens ?? [], side === 'right', glyph), [combo?.tokens, side, glyph])
  const [state, setState] = useState(() => startPractice(steps))
  const [stepsKey, setStepsKey] = useState(steps)
  if (stepsKey !== steps) {
    // Combo edited in the main window or side switched: start over.
    setStepsKey(steps)
    setState((s) => startPractice(steps, s))
  }
  const reference = combo && referenceFits(steps, combo.timing) ? combo.timing! : null

  usePadEvents(settings.padIndex, glyph, (ev, time) => {
    if (ev.type === 'insert') setState((s) => ev.tokens.reduce((acc, t) => feedPractice(acc, t, time), s))
  })

  // Sound cues and drill progress follow the practice state.
  const prev = useRef<PracticeState>(state)
  useEffect(() => {
    const p = prev.current
    prev.current = state
    if (state.completions > p.completions) {
      if (sound) sounds.clean()
      if (drill && state.completions >= drill.reps) {
        const t = setTimeout(() => drill.onDone(state.completions + state.drops, state.completions), 700)
        return () => clearTimeout(t)
      }
    } else if (state.mistake && state.mistake !== p.mistake) {
      if (sound) sounds.drop()
    } else if (state.index > p.index && sound) {
      // On time (or no reference yet) gets the higher tick.
      const k = buttonSteps(steps).indexOf(state.index - 1)
      const gaps = buttonGaps(steps, state.hitTimes)
      const onTime = !reference || k < 1 || judge(gaps[k - 1], reference[k - 1]).verdict === 'ok'
      if (k >= 0) sounds.tick(onTime)
    }
  }, [state, sound, steps, reference, drill])

  // Record each landed combo and each drop in the long-term practice history.
  const record = useStats((s) => s.record)
  const stats = useStats((s) => (combo ? s.book[statsKey(combo.tokens)] : undefined))
  const counted = useRef({ completions: state.completions, drops: state.drops })
  useEffect(() => {
    const prevCount = counted.current
    counted.current = { completions: state.completions, drops: state.drops }
    if (!combo) return
    for (let i = prevCount.completions; i < state.completions; i++) record(combo.tokens, true)
    for (let i = prevCount.drops; i < state.drops; i++) record(combo.tokens, false)
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
  // Timing marks: the attempt in progress, or the last clean run between attempts.
  const shownTimes = state.index > 0 || !state.lastRun.length ? state.hitTimes : state.lastRun
  const gaps = buttonGaps(steps, shownTimes)
  const marks = new Map<number, { verdict: string; text: string }>()
  if (reference) {
    buttonSteps(steps).slice(1, gaps.length + 1).forEach((stepIndex, k) => {
      const j = judge(gaps[k], reference[k])
      marks.set(steps[stepIndex].source, { verdict: j.verdict, text: j.verdict === 'ok' ? '✓' : `${j.off > 0 ? '+' : ''}${j.off}f` })
    })
  }
  const lastGaps = buttonGaps(steps, state.lastRun)
  const useAsReference = () =>
    combo && sendToMain('set-timing', { player, comboId: combo.id, timing: lastGaps })

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
          {soundButton}
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
              <span>
                {drill ? `Combo ${drill.index + 1}/${drill.total} · ${Math.min(state.completions, drill.reps)}/${drill.reps} clean` : `✔ ${state.completions}`}
                {side === 'right' ? ' · P2 side' : ''}
              </span>
            </div>
            <div className="overlay-tokens">
              {combo.tokens.map((t, i) =>
                t === 'newline' ? <span key={i} className="tok-break" /> : (
                  <span key={i} className={`practice-tok${doneSources.has(i) ? ' is-done' : ''}${current?.source === i ? ' is-current' : ''}`}>
                    <TokenView token={t} glyph={glyph} size={size} />
                    {marks.has(i) && <span className={`timing-mark is-${marks.get(i)!.verdict}`}>{marks.get(i)!.text}</span>}
                  </span>
                ),
              )}
            </div>
            <div className="practice-bar"><span style={{ width: `${(state.index / steps.length) * 100}%` }} /></div>
            <div className={`practice-status${state.mistake ? ' is-miss' : ''}`}>
              {state.mistake
                ? `Dropped: expected ${labelFor(state.mistake.expected, glyph)}, got ${labelFor(state.mistake.got, glyph)}`
                : state.index === 0 && state.completions ? 'Clean! Go again.' : `Next: ${current ? labelFor(current.token, glyph) : ''}`}
            </div>
            <div className="practice-timing">
              {reference ? (
                <>
                  <span title="Frames between button presses in the reference rhythm">Rhythm: {reference.join(' · ')}f</span>
                  <button className="btn btn-small" onClick={() => sounds.rhythm(reference)} title="Hear the rhythm"><Play size={12} /> Play</button>
                  {lastGaps.length > 0 && <button className="btn btn-small" onClick={useAsReference} title="Replace the rhythm with your last clean run">Use my last run</button>}
                </>
              ) : lastGaps.length > 0 ? (
                <>
                  <span>Last clean run: {lastGaps.join(' · ')}f</span>
                  <button className="btn btn-small" onClick={useAsReference} title="Save this rhythm; later attempts show early/late against it">Use as reference</button>
                </>
              ) : (
                gaps.length > 0 && <span className="practice-gaps">Frames between presses: {gaps.join(' · ')}</span>
              )}
            </div>
            {stats && <PracticeHistory stats={stats} />}
          </div>
        )
      }}
    </FloatingShell>
  )
}

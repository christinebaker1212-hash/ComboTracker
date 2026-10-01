// Practice mode: compares live controller input against a combo, step by step.
import { MOTION_EXPANSIONS, SYMBOLS, type Token } from './tokens'

const MIRROR: Record<string, string> = {
  left: 'right', right: 'left', upleft: 'upright', upright: 'upleft', downleft: 'downright', downright: 'downleft',
}

/** One thing the player must input: a direction, or a button. */
export interface Step {
  token: Token
  /** Index of the combo token this step came from, for highlighting. */
  source: number
}

const base = (t: Token) => (/^[ch]_/.test(t) ? t.slice(2) : t)

/**
 * Turns a combo into the inputs to perform: separators are dropped, motion
 * icons expand to their directions, charge/hold markers match the plain input,
 * and everything is mirrored when playing from the right side.
 */
export function stepsFor(tokens: Token[], facingLeft = false): Step[] {
  const steps: Step[] = []
  tokens.forEach((t, source) => {
    if (SYMBOLS.has(t)) return
    const plain = base(t)
    const dirs = MOTION_EXPANSIONS[plain]
    if (dirs) for (const d of dirs) steps.push({ token: facingLeft ? (MIRROR[d] ?? d) : d, source })
    else if (plain !== '360') steps.push({ token: facingLeft ? (MIRROR[plain] ?? plain) : plain, source })
  })
  return steps
}

export interface PracticeState {
  steps: Step[]
  index: number
  /** Time each completed step was hit, for timing feedback. */
  hitTimes: number[]
  mistake: { expected: Token; got: Token; at: number } | null
  best: number
  completions: number
  /** Attempts that got at least one input in, then went wrong. */
  drops: number
}

export function startPractice(steps: Step[], prev?: PracticeState): PracticeState {
  return { steps, index: 0, hitTimes: [], mistake: null, best: prev?.best ?? 0, completions: prev?.completions ?? 0, drops: prev?.drops ?? 0 }
}

const isDirection = (t: Token) => ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright'].includes(t)

/**
 * Feeds one input token. Stray directions are forgiven (sticks pass through
 * neighbours), but a wrong button is a drop and the attempt restarts.
 */
export function feedPractice(s: PracticeState, input: Token, time: number): PracticeState {
  if (SYMBOLS.has(input)) return s
  const got = base(input)
  const expected = s.steps[s.index]?.token
  if (!expected) return s
  if (got === expected) {
    const index = s.index + 1
    const done = index === s.steps.length
    return {
      ...s,
      index: done ? 0 : index,
      hitTimes: done ? [] : [...s.hitTimes, time],
      mistake: null,
      best: Math.max(s.best, index),
      completions: s.completions + (done ? 1 : 0),
    }
  }
  if (isDirection(got)) return s
  // Pressing the first button of the combo again restarts cleanly instead of counting as a drop.
  if (got === s.steps[0]?.token) {
    return { ...s, index: 1, hitTimes: [time], mistake: null, best: Math.max(s.best, 1), drops: s.drops + (s.index > 1 ? 1 : 0) }
  }
  return { ...s, index: 0, hitTimes: [], mistake: { expected, got, at: s.index }, drops: s.drops + (s.index > 0 ? 1 : 0) }
}

/** Milliseconds → frames at 60 fps, the unit fighting game players think in. */
export const toFrames = (ms: number) => Math.round(ms / (1000 / 60))

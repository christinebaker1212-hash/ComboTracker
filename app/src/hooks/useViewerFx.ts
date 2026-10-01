// Input viewer effects: a glow that fades after each release, a trail behind
// the stick, and fading the whole viewer out while the controller is idle.
import { useEffect, useRef, useState } from 'react'
import type { PadState } from '../core/input'
import { stickOffset, type Layout } from '../core/layouts'

export interface ViewerFx {
  /** Buttons keep a fading glow for a moment after release. */
  glow: boolean
  /** The stick leaves a short trail showing the motion you just did. */
  trail: boolean
  /** Light, medium and heavy buttons light up blue, yellow and red. */
  strength: boolean
  /** Fade the viewer out when the controller hasn't been touched for a few seconds. */
  idleFade: boolean
}

export const DEFAULT_FX: ViewerFx = { glow: true, trail: true, strength: false, idleFade: false }

/** How long effects last, in ms. */
export const GLOW_MS = 260
export const TRAIL_MS = 320
export const IDLE_MS = 4000

export interface FxFrame {
  /** Element id → glow strength 0–1. */
  glow: Record<string, number>
  /** Stick element index → recent ball positions, oldest first, as -1..1 offsets with age 0–1. */
  trails: Record<number, { x: number; y: number; age: number }[]>
  idle: boolean
}

const EMPTY: FxFrame = { glow: {}, trails: {}, idle: false }

export function useViewerFx(layout: Layout | null, state: PadState, fx: ViewerFx): FxFrame {
  const [frame, setFrame] = useState<FxFrame>(EMPTY)
  const released = useRef(new Map<string, number>())
  const points = useRef(new Map<number, { x: number; y: number; t: number }[]>())
  const prevPressed = useRef(new Set<string>())
  const lastActive = useRef(0)
  const raf = useRef(0)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    const now = performance.now()
    for (const id of prevPressed.current) if (!state.pressed.has(id)) released.current.set(id, now)
    prevPressed.current = new Set(state.pressed)
    let moved = false
    layout?.elements.forEach((el, i) => {
      if (el.type !== 'stick') return
      const [x, y] = stickOffset(el, state)
      const list = points.current.get(i) ?? []
      const last = list.at(-1)
      if (!last || Math.hypot(last.x - x, last.y - y) > 0.02) {
        list.push({ x, y, t: now })
        points.current.set(i, list)
        if (x || y) moved = true
      }
    })
    if (state.pressed.size || moved) lastActive.current = now

    // Animate until every glow and trail has faded.
    const tick = () => {
      const t = performance.now()
      const glow: FxFrame['glow'] = {}
      if (fx.glow) {
        for (const [id, at] of released.current) {
          const k = 1 - (t - at) / GLOW_MS
          if (k > 0 && !state.pressed.has(id)) glow[id] = k
          else released.current.delete(id)
        }
      }
      const trails: FxFrame['trails'] = {}
      if (fx.trail) {
        for (const [i, list] of points.current) {
          const keep = list.filter((p) => t - p.t < TRAIL_MS)
          points.current.set(i, keep.length ? keep : list.slice(-1))
          if (keep.length > 1) trails[i] = keep.map((p) => ({ x: p.x, y: p.y, age: (t - p.t) / TRAIL_MS }))
        }
      }
      const active = Object.keys(glow).length > 0 || Object.keys(trails).length > 0
      setFrame((f) => (active || Object.keys(f.glow).length || Object.keys(f.trails).length ? { glow, trails, idle: false } : f))
      raf.current = active ? requestAnimationFrame(tick) : 0
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [layout, state, fx.glow, fx.trail])

  useEffect(() => {
    if (!fx.idleFade) return
    // Checked often so the viewer comes back the moment you touch the controller.
    const timer = setInterval(() => setIdle(performance.now() - lastActive.current > IDLE_MS), 100)
    return () => clearInterval(timer)
  }, [fx.idleFade])

  return { ...frame, idle: fx.idleFade && idle }
}

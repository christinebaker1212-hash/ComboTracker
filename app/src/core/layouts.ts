// Input viewer layouts: the same JSON the desktop app writes to Presets/Layouts.
import type { Token } from './tokens'

export type ElementType = 'glyph' | 'rect' | 'circle' | 'stick'

export interface LayoutElement {
  /** Which input lights it up: X, DPAD_UP, LEFT_THUMB, joystick, … */
  id: string
  type: ElementType
  token?: Token
  x: number
  y: number
  size?: number
  w?: number
  h?: number
  fill_color?: string
  hl_color?: string
  base_color?: string
}

export interface Layout {
  name: string
  /** Icon name from icons/, a data: URL, or (old files) an absolute path we map back to an icon. */
  bg_image?: string
  elements: LayoutElement[]
}

/** Friendly names for input IDs, shown in the builder instead of XInput jargon. */
export const INPUT_LABELS: Record<string, string> = {
  A: 'A / Cross', B: 'B / Circle', X: 'X / Square', Y: 'Y / Triangle',
  LEFT_SHOULDER: 'LB / L1', RIGHT_SHOULDER: 'RB / R1', LT: 'LT / L2', RT: 'RT / R2',
  BACK: 'Back / Select', START: 'Start', LEFT_THUMB: 'Left stick', RIGHT_THUMB: 'Right stick',
  DPAD_UP: 'D-pad up', DPAD_DOWN: 'D-pad down', DPAD_LEFT: 'D-pad left', DPAD_RIGHT: 'D-pad right',
  joystick: 'Arcade stick', TOUCHPAD: 'Touchpad',
  L_STICK_UP: 'Left stick up', L_STICK_DOWN: 'Left stick down', L_STICK_LEFT: 'Left stick left', L_STICK_RIGHT: 'Left stick right',
  R_STICK_UP: 'Right stick up', R_STICK_DOWN: 'Right stick down', R_STICK_LEFT: 'Right stick left', R_STICK_RIGHT: 'Right stick right',
}
export const INPUT_IDS = Object.keys(INPUT_LABELS)
export const inputLabel = (id: string) => INPUT_LABELS[id] ?? id

const SHORT: Record<string, string> = {
  DPAD_UP: '↑', DPAD_DOWN: '↓', DPAD_LEFT: '←', DPAD_RIGHT: '→',
  L_STICK_UP: 'L↑', L_STICK_DOWN: 'L↓', L_STICK_LEFT: 'L←', L_STICK_RIGHT: 'L→',
  R_STICK_UP: 'R↑', R_STICK_DOWN: 'R↓', R_STICK_LEFT: 'R←', R_STICK_RIGHT: 'R→',
  LEFT_THUMB: 'LS', RIGHT_THUMB: 'RS', joystick: 'Stick', TOUCHPAD: 'Pad', START: 'Start', BACK: 'Back',
  LEFT_SHOULDER: 'LB', RIGHT_SHOULDER: 'RB',
}
/** Compact label drawn on the editor canvas. */
export const shortLabel = (id: string) => SHORT[id] ?? id

/** A sensible new element for an input, so adding one rarely needs tweaking. */
export function defaultElement(id: string, x = 100, y = 100): LayoutElement {
  const faces: Record<string, Token> = { X: 'lp', Y: 'mp', A: 'lk', B: 'mk', RIGHT_SHOULDER: 'hp', LEFT_SHOULDER: 'any_p' }
  if (['LEFT_THUMB', 'RIGHT_THUMB', 'joystick'].includes(id)) return { id, type: 'stick', x, y, size: 14 }
  if (id in faces) return { id, type: 'glyph', token: faces[id], x, y, size: 13 }
  if (id === 'LT') return { id, type: 'rect', token: 'any_k', x, y, w: 30, h: 12 }
  if (id === 'RT') return { id, type: 'rect', token: 'hk', x, y, w: 30, h: 12 }
  if (id === 'START' || id === 'BACK') return { id, type: 'rect', x, y, w: 10, h: 5 }
  if (id === 'TOUCHPAD') return { id, type: 'rect', x, y, w: 60, h: 35 }
  return { id, type: 'rect', x, y, w: 14, h: 14 }
}

/**
 * Resolves a layout's background to an icon name we ship, fixing up absolute
 * paths saved on the author's PC ("D:/Tools/…/icons/XboxOne.png" → "xboxone").
 */
export function layoutBackground(layout: Layout, icons: ReadonlySet<string>): { icon?: string; url?: string } {
  const bg = layout.bg_image ?? ''
  if (bg.startsWith('data:')) return { url: bg }
  const base = bg.split(/[\\/]/).pop()?.replace(/\.[a-z]+$/i, '').toLowerCase()
  if (base && icons.has(base)) return { icon: base }
  const guess = layout.name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (icons.has(guess)) return { icon: guess }
  return {}
}

/** Bounding box of the elements, for sizing the viewer window. */
export function layoutBounds(elements: LayoutElement[]): { width: number; height: number } {
  let w = 0
  let h = 0
  for (const el of elements) {
    if (el.type === 'rect') {
      w = Math.max(w, el.x + (el.w ?? 14) * 1.2)
      h = Math.max(h, el.y + (el.h ?? 14) * 1.2)
    } else {
      const r = (el.size ?? 14) * 1.25
      w = Math.max(w, el.x + r)
      h = Math.max(h, el.y + r)
    }
  }
  return { width: w + 20, height: h + 20 }
}

export function parseLayout(json: unknown, fallbackName: string): Layout {
  const d = (json ?? {}) as Partial<Layout>
  if (!Array.isArray(d.elements)) throw new Error('Not a controller layout: missing "elements".')
  return {
    name: typeof d.name === 'string' && d.name ? d.name : fallbackName,
    bg_image: typeof d.bg_image === 'string' ? d.bg_image : '',
    elements: d.elements.filter((e) => e && typeof e.id === 'string' && typeof e.x === 'number'),
  }
}

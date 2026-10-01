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

/** The drawn controller shape behind the buttons. Original artwork, coloured by the theme. */
export type BodyShape = 'gamepad' | 'arcade' | 'none'

export interface Layout {
  name: string
  /** Optional picture the user uploaded (a data: URL). Old files hold a path here, which is ignored. */
  bg_image?: string
  body?: BodyShape
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

/** The user's own uploaded picture, if any. Paths from older files (pictures of real controllers) are ignored. */
export const layoutPicture = (layout: Layout): string | null =>
  layout.bg_image?.startsWith('data:') ? layout.bg_image : null

/** Which drawn body to show: the layout's own choice, or a guess from its inputs and name. */
export function layoutBody(layout: Layout): BodyShape {
  if (layout.body) return layout.body
  if (layoutPicture(layout)) return 'none'
  const arcade = /arcade|leverless|vewlix|sega|noir|ist|sf2|mvs|mortal|hitbox|stick/i.test(layout.name)
  return arcade || layout.elements.some((e) => e.id === 'joystick') ? 'arcade' : 'gamepad'
}

/** Area covered by the elements, including how much they grow when pressed. */
export function elementBox(elements: LayoutElement[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const el of elements) {
    if (el.type === 'rect') {
      x0 = Math.min(x0, el.x); y0 = Math.min(y0, el.y)
      x1 = Math.max(x1, el.x + (el.w ?? 14)); y1 = Math.max(y1, el.y + (el.h ?? 14))
    } else {
      const r = (el.size ?? 14) * 1.25
      x0 = Math.min(x0, el.x - r); y0 = Math.min(y0, el.y - r)
      x1 = Math.max(x1, el.x + r); y1 = Math.max(y1, el.y + r)
    }
  }
  return elements.length ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 100, y1: 60 }
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
    body: d.body === 'gamepad' || d.body === 'arcade' || d.body === 'none' ? d.body : undefined,
    elements: d.elements.filter((e) => e && typeof e.id === 'string' && typeof e.x === 'number'),
  }
}

export interface BodyBox { x: number; y: number; w: number; h: number }

/** Extra room the body leaves around the buttons. */
const PAD = 18

/** Where the drawn body goes for a given element area, and how far it extends. */
export function bodyBox(shape: BodyShape, box: { x0: number; y0: number; x1: number; y1: number }): BodyBox | null {
  if (shape === 'none') return null
  const x = box.x0 - PAD
  const y = box.y0 - PAD
  const w = box.x1 - box.x0 + PAD * 2
  const h = box.y1 - box.y0 + PAD * 2
  // The gamepad's grips hang below the button area.
  return { x, y, w, h: shape === 'gamepad' ? h * 1.45 : h }
}


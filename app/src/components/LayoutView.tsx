import { useEffect, useState } from 'react'
import { iconUrl, useAssets } from '../assets'
import { iconSource, type GlyphPack } from '../core/glyphs'
import type { PadState } from '../core/input'
import { bodyBox, elementBox, layoutBody, layoutPicture, shortLabel, type Layout, type LayoutElement } from '../core/layouts'
import { ControllerBody } from './ControllerBody'
import type { Theme } from '../core/theme'

export interface LayoutLook {
  outline: number
  highlight: number
  showImage: boolean
}

function useImageSize(src: string | null) {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null)
  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => setSize({ src, w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src])
  return size && size.src === src ? size : null
}

const IDLE: PadState = { pressed: new Set(), left: [0, 0], right: [0, 0], dir: null }

/** Where a stick's ball sits: its own axes, or (arcade stick) the left stick / D-pad. */
function stickOffset(el: LayoutElement, s: PadState): [number, number] {
  let [dx, dy] = el.id === 'RIGHT_THUMB' ? s.right : s.left
  if (Math.hypot(dx, dy) < 0.15) [dx, dy] = [0, 0]
  if (el.id !== 'RIGHT_THUMB' && el.id !== 'LEFT_THUMB' && !dx && !dy && s.dir) {
    dx = s.dir.includes('left') ? -1 : s.dir.includes('right') ? 1 : 0
    dy = s.dir.includes('up') ? -1 : s.dir.includes('down') ? 1 : 0
    if (dx && dy) [dx, dy] = [dx * 0.707, dy * 0.707]
  }
  const m = Math.hypot(dx, dy)
  return m > 1 ? [dx / m, dy / m] : [dx, dy]
}

/**
 * Draws a controller layout as SVG. Used live by the input viewer and, with
 * `editing`, by the layout editor (labels, selection, dragging).
 */
export function LayoutView({ layout, state = IDLE, glyph, theme, look, scale = 1, editing }: {
  layout: Layout
  state?: PadState
  glyph: GlyphPack
  theme: Theme
  look: LayoutLook
  scale?: number
  editing?: {
    selected: number | null
    onPointerDown: (index: number, e: React.PointerEvent) => void
    onBackground: () => void
  }
}) {
  const { icons } = useAssets()
  const picture = look.showImage ? layoutPicture(layout) : null
  const img = useImageSize(picture)
  const shape = look.showImage ? layoutBody(layout) : 'none'
  const ebox = elementBox(layout.elements)
  const body = bodyBox(shape, ebox)
  // Everything drawn: elements, body and any uploaded picture.
  const minX = Math.min(0, ebox.x0, body?.x ?? 0) - 6
  const minY = Math.min(0, ebox.y0, body?.y ?? 0) - 6
  const maxX = Math.max(ebox.x1, body ? body.x + body.w : 0, img?.w ?? 0, editing ? 320 : 0) + 6
  const maxY = Math.max(ebox.y1, body ? body.y + body.h : 0, img?.h ?? 0, editing ? 200 : 0) + 12
  const width = maxX - minX
  const height = maxY - minY
  const idle = theme.btnBg
  const hl = theme.highlight

  const icon = (token: string | undefined, size: number, cx: number, cy: number) => {
    if (!token) return null
    const src = iconSource(token, glyph, icons, iconUrl, { gamepad: true })
    return src ? <image href={src} x={cx - size / 2} y={cy - size / 2} width={size} height={size} pointerEvents="none" /> : null
  }

  return (
    <svg
      className="layout-svg"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      onPointerDown={(e) => e.target === e.currentTarget && editing?.onBackground()}
    >
      {body && <ControllerBody shape={shape} box={body} theme={theme} />}
      {img && picture && <image href={picture} x={0} y={0} width={img.w} height={img.h} pointerEvents="none" />}
      {layout.elements.map((el, i) => {
        const on = state.pressed.has(el.id) || (el.type === 'stick' && state.pressed.has(el.id))
        const stroke = on ? el.hl_color || hl : idle
        const sw = on ? look.highlight : look.outline
        const sel = editing?.selected === i
        const common = {
          className: `lv-el${editing ? ' is-editable' : ''}${sel ? ' is-selected' : ''}`,
          onPointerDown: editing ? (e: React.PointerEvent) => editing.onPointerDown(i, e) : undefined,
        }
        const label = editing && (
          <text x={0} y={0} className="lv-label" textAnchor="middle" dominantBaseline="central" pointerEvents="none">
            {shortLabel(el.id)}
          </text>
        )

        if (el.type === 'stick') {
          const r = el.size ?? 14
          const [dx, dy] = stickOffset(el, state)
          const moved = Math.hypot(dx, dy) > 0.1
          const ring = on || moved ? el.hl_color || hl : idle
          return (
            <g key={i} {...common} transform={`translate(${el.x} ${el.y})`}>
              <circle r={r} fill={el.base_color || '#111111'} stroke={ring} strokeWidth={on || moved ? look.highlight : look.outline} />
              <circle cx={dx * r * 0.6} cy={dy * r * 0.6} r={r * 0.6} fill={on ? el.hl_color || hl : el.fill_color || theme.bg} stroke={ring} strokeWidth={look.outline} />
              {label}
            </g>
          )
        }
        if (el.type === 'glyph') {
          const r = (el.size ?? 13) * (on ? 1.25 : 1)
          return (
            <g key={i} {...common} transform={`translate(${el.x} ${el.y})`}>
              <circle r={r} fill={on ? stroke : el.base_color || theme.bg} stroke={stroke} strokeWidth={sw} />
              {icon(el.token, (el.size ?? 13) * 1.8, 0, 0)}
              {label}
            </g>
          )
        }
        if (el.type === 'circle') {
          const r = (el.size ?? 6) * (on ? 1.2 : 1)
          const fill = on ? el.hl_color || hl : el.fill_color || idle
          return (
            <g key={i} {...common} transform={`translate(${el.x} ${el.y})`}>
              <circle r={r} fill={fill} stroke={fill} strokeWidth={sw} />
              {label}
            </g>
          )
        }
        // rect
        const w = el.w ?? 14
        const h = el.h ?? 14
        const k = on ? 1.2 : 1
        const fill = on ? el.hl_color || hl : el.fill_color || idle
        return (
          <g key={i} {...common} transform={`translate(${el.x + w / 2} ${el.y + h / 2})`}>
            <rect x={(-w * k) / 2} y={(-h * k) / 2} width={w * k} height={h * k} rx={Math.min(w, h) * 0.18} fill={fill} stroke={fill} strokeWidth={sw} />
            {icon(el.token, Math.min(w, h) * 1.2, 0, 0)}
            {label}
          </g>
        )
      })}
    </svg>
  )
}

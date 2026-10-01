import { useEffect, useState } from 'react'
import { iconUrl, useAssets } from '../assets'
import { iconSource, type GlyphPack } from '../core/glyphs'
import type { PadState } from '../core/input'
import { elementBox, layoutBody, layoutPicture, layoutTrace, panelBox, shortLabel, stickOffset, type Layout } from '../core/layouts'
import { ArcadePanel, ControllerTrace } from './ControllerBody'
import type { Theme } from '../core/theme'
import type { FxFrame } from '../hooks/useViewerFx'

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

/** "Colour by strength": the usual light / medium / heavy colours. */
const STRENGTH: Record<string, string> = {
  lp: '#3fa7ff', lk: '#3fa7ff', mp: '#ffd23f', mk: '#ffd23f', hp: '#ff4d4d', hk: '#ff4d4d',
  any_p: '#d0d0d0', any_k: '#d0d0d0',
}

/**
 * Draws a controller layout as SVG. Used live by the input viewer and, with
 * `editing`, by the layout editor (labels, selection, dragging).
 */
export function LayoutView({ layout, state = IDLE, glyph, theme, look, scale = 1, editing, fx }: {
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
  /** Input viewer effects (glow after release, stick trail, colour by strength). */
  fx?: { frame: FxFrame; strength: boolean }
}) {
  const { icons } = useAssets()
  const picture = look.showImage ? layoutPicture(layout) : null
  const img = useImageSize(picture)
  const { manifest } = useAssets()
  const traces = new Set(Object.keys(manifest.controllers))
  const shape = look.showImage ? layoutBody(layout, traces) : 'none'
  const traceKey = shape === 'trace' ? layoutTrace(layout, traces) : null
  const traceSize = traceKey ? manifest.controllers[traceKey] : null
  const ebox = elementBox(layout.elements)
  const panel = shape === 'arcade' ? panelBox(ebox) : null
  // Everything drawn: elements, the drawing behind them, and any uploaded picture.
  const minX = Math.min(0, ebox.x0, panel?.x ?? 0) - 6
  const minY = Math.min(0, ebox.y0, panel?.y ?? 0) - 6
  const maxX = Math.max(ebox.x1, panel ? panel.x + panel.w : 0, traceSize?.[0] ?? 0, img?.w ?? 0, editing ? 320 : 0) + 6
  const maxY = Math.max(ebox.y1, panel ? panel.y + panel.h : 0, traceSize?.[1] ?? 0, img?.h ?? 0, editing ? 200 : 0) + 6
  const width = maxX - minX
  const height = maxY - minY
  const idle = theme.btnBg
  const themeHl = theme.highlight

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
      {traceKey && traceSize && <ControllerTrace traceKey={traceKey} size={traceSize} theme={theme} />}
      {panel && <ArcadePanel box={panel} theme={theme} />}
      {img && picture && <image href={picture} x={0} y={0} width={img.w} height={img.h} pointerEvents="none" />}
      {fx && layout.elements.map((el, i) => {
        // Glow rings fading out after release, drawn under the buttons.
        const glow = fx.frame.glow[el.id]
        const colour = el.hl_color || (fx.strength && el.token && STRENGTH[el.token]) || themeHl
        if (!glow) return null
        const cx = el.type === 'rect' ? el.x + (el.w ?? 14) / 2 : el.x
        const cy = el.type === 'rect' ? el.y + (el.h ?? 14) / 2 : el.y
        const r = el.type === 'rect' ? Math.max(el.w ?? 14, el.h ?? 14) * 0.6 : (el.size ?? 13) * 1.15
        return (
          <circle
            key={`fx${i}`} cx={cx} cy={cy} r={r * (1.35 - glow * 0.25)} fill={colour} opacity={glow * 0.45} pointerEvents="none"
          />
        )
      })}
      {layout.elements.map((el, i) => {
        const on = state.pressed.has(el.id) || (el.type === 'stick' && state.pressed.has(el.id))
        const hl = el.hl_color || (fx?.strength && el.token && STRENGTH[el.token]) || themeHl
        const stroke = on ? hl : idle
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
          const ring = on || moved ? hl : idle
          return (
            <g key={i} {...common} transform={`translate(${el.x} ${el.y})`}>
              <circle r={r} fill={el.base_color || '#111111'} stroke={ring} strokeWidth={on || moved ? look.highlight : look.outline} />
              <circle cx={dx * r * 0.6} cy={dy * r * 0.6} r={r * 0.6} fill={on ? hl : el.fill_color || theme.bg} stroke={ring} strokeWidth={look.outline} />
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
          const fill = on ? hl : el.fill_color || idle
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
        const fill = on ? hl : el.fill_color || idle
        return (
          <g key={i} {...common} transform={`translate(${el.x + w / 2} ${el.y + h / 2})`}>
            <rect x={(-w * k) / 2} y={(-h * k) / 2} width={w * k} height={h * k} rx={Math.min(w, h) * 0.18} fill={fill} stroke={fill} strokeWidth={sw} />
            {icon(el.token, Math.min(w, h) * 1.2, 0, 0)}
            {label}
          </g>
        )
      })}
      {fx && layout.elements.map((el, i) => {
        // The stick's trail goes on top so the stick base doesn't hide it.
        const colour = el.hl_color || (fx.strength && el.token && STRENGTH[el.token]) || themeHl
        const trail = fx.frame.trails[i]
        if (trail && el.type === 'stick') {
          const r = (el.size ?? 14) * 0.6
          return (
            <g key={`fx${i}`} transform={`translate(${el.x} ${el.y})`} pointerEvents="none">
              {trail.slice(1).map((p, j) => (
                <line
                  key={j}
                  x1={trail[j].x * r} y1={trail[j].y * r} x2={p.x * r} y2={p.y * r}
                  stroke={colour} strokeWidth={r * 0.7 * (1 - p.age)} strokeLinecap="round" opacity={(1 - p.age) * 0.8}
                />
              ))}
            </g>
          )
        }
        return null
      })}
    </svg>
  )
}

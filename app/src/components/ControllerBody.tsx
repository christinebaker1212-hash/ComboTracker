import { useId } from 'react'
import { controllerUrl } from '../assets'
import type { Theme } from '../core/theme'

/** A traced controller drawing, tinted with the theme's text colour. */
export function ControllerTrace({ traceKey, size, theme }: { traceKey: string; size: [number, number]; theme: Theme }) {
  const id = useId().replace(/:/g, '')
  const [w, h] = size
  return (
    <g pointerEvents="none" className="lv-trace">
      <defs>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <image href={controllerUrl(traceKey)} x={0} y={0} width={w} height={h} />
        </mask>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill={theme.font} opacity={0.85} mask={`url(#${id}-m)`} />
    </g>
  )
}

/** Arcade-panel outline in the same line style as the tracings. */
export function ArcadePanel({ box, theme }: { box: { x: number; y: number; w: number; h: number }; theme: Theme }) {
  const { x, y, w, h } = box
  return (
    <g pointerEvents="none" className="lv-trace" fill="none" stroke={theme.font} strokeOpacity={0.85} strokeLinejoin="round">
      <rect x={x} y={y} width={w} height={h} rx={12} strokeWidth={1.6} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={8} strokeWidth={0.7} strokeOpacity={0.45} />
    </g>
  )
}

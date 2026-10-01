import { useId } from 'react'
import type { BodyBox, BodyShape } from '../core/layouts'
import type { Theme } from '../core/theme'

/** Original controller artwork drawn from the theme colours. */
export function ControllerBody({ shape, box, theme }: { shape: BodyShape; box: BodyBox; theme: Theme }) {
  const id = useId().replace(/:/g, '')
  const g = theme.gradient
  const fill = g ? `url(#${id}-grad)` : theme.entryBg
  const defs = (
    <defs>
      {g && (
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={g[0]} />
          <stop offset="0.5" stopColor={g[1]} />
          <stop offset="1" stopColor={g[3]} />
        </linearGradient>
      )}
      <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  )
  const stroke = { stroke: theme.font, strokeOpacity: 0.22, strokeWidth: 1.5 }

  if (shape === 'arcade') {
    const { x, y, w, h } = box
    return (
      <g pointerEvents="none">
        {defs}
        <rect x={x} y={y + 6} width={w} height={h} rx={14} fill="#000" opacity={0.25} />
        <rect x={x} y={y} width={w} height={h} rx={14} fill={fill} {...stroke} />
        <rect x={x} y={y} width={w} height={h} rx={14} fill={`url(#${id}-shine)`} />
        <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={10} fill="none" stroke={theme.font} strokeOpacity={0.08} />
      </g>
    )
  }

  // Gamepad silhouette in a unit box: body on top, two grips below.
  const { x, y, w } = box
  const H = box.h / 1.45
  const X = (u: number) => x + u * w
  const Y = (v: number) => y + v * H
  const d = [
    `M ${X(0.2)} ${Y(0)}`,
    `L ${X(0.8)} ${Y(0)}`,
    `C ${X(0.95)} ${Y(0)} ${X(1)} ${Y(0.18)} ${X(1)} ${Y(0.42)}`,
    `C ${X(1.01)} ${Y(0.8)} ${X(0.99)} ${Y(1.25)} ${X(0.9)} ${Y(1.4)}`,
    `C ${X(0.84)} ${Y(1.48)} ${X(0.77)} ${Y(1.42)} ${X(0.74)} ${Y(1.32)}`,
    `L ${X(0.66)} ${Y(1.04)}`,
    `C ${X(0.62)} ${Y(0.98)} ${X(0.38)} ${Y(0.98)} ${X(0.34)} ${Y(1.04)}`,
    `L ${X(0.26)} ${Y(1.32)}`,
    `C ${X(0.23)} ${Y(1.42)} ${X(0.16)} ${Y(1.48)} ${X(0.1)} ${Y(1.4)}`,
    `C ${X(0.01)} ${Y(1.25)} ${X(-0.01)} ${Y(0.8)} ${X(0)} ${Y(0.42)}`,
    `C ${X(0)} ${Y(0.18)} ${X(0.05)} ${Y(0)} ${X(0.2)} ${Y(0)} Z`,
  ].join(' ')
  return (
    <g pointerEvents="none">
      {defs}
      <path d={d} fill="#000" opacity={0.25} transform="translate(0 6)" />
      <path d={d} fill={fill} {...stroke} />
      <path d={d} fill={`url(#${id}-shine)`} />
    </g>
  )
}

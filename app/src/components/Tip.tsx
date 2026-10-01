import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store/useStore'
import { activeTip, TIPS, useTips } from '../store/useTips'
import { useUI } from '../store/useUI'

const ZOOM = { compact: 0.9, standard: 1, large: 1.15 }

/**
 * Wraps a control and, the first time it appears, points a short tip at it.
 * `align` picks which edge of the control the bubble lines up with.
 */
export function Tip({ id, children, align = 'start' }: { id: keyof typeof TIPS & string; children: ReactNode; align?: 'start' | 'end' }) {
  const mount = useTips((s) => s.mount)
  const dismiss = useTips((s) => s.dismiss)
  const active = useTips(activeTip) === id
  const enabled = useStore((s) => s.settings.tips)
  const zoom = ZOOM[useStore((s) => s.settings.uiSize)]
  const dialogOpen = useUI((s) => !!s.dialog)
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const show = active && enabled && !dialogOpen

  useEffect(() => mount(id), [id, mount])

  useLayoutEffect(() => {
    if (!show || !ref.current) return setPos(null)
    const place = () => {
      const r = ref.current!.getBoundingClientRect()
      const vw = window.innerWidth / zoom
      setPos(align === 'end'
        ? { top: r.bottom / zoom + 10, right: vw - r.right / zoom }
        : { top: r.bottom / zoom + 10, left: r.left / zoom })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [show, align, zoom])

  return (
    <span ref={ref} className="tip-anchor">
      {children}
      {show && pos && (
        <span className={`tip tip-${align}`} style={pos} role="note">
          <span>{TIPS[id]}</span>
          <span className="tip-actions">
            <button className="tip-link" onClick={() => useStore.getState().setSettings({ tips: false })}>Hide all tips</button>
            <button className="btn btn-small btn-accent" onClick={() => dismiss(id)}>Got it</button>
          </span>
        </span>
      )}
    </span>
  )
}

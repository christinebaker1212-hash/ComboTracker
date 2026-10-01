// Shared behaviour for the floating windows (combo overlay, input viewer):
// live state from the main window, drag to move, scroll to resize, a hover
// toolbar, backdrop choice, click-through lock, and shrink-to-fit.
import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { themeToCss, type Theme } from '../core/theme'
import {
  applyClickThrough, closeWindow, fitWindow, isDesktop, onOverlayLock, overlaysLocked, startWindowDrag,
} from '../platform'

export type Backdrop = 'clear' | 'theme' | 'dark' | 'chroma'
const BACKDROPS: Backdrop[] = isDesktop ? ['clear', 'dark', 'theme', 'chroma'] : ['theme', 'dark', 'chroma']
const BACKDROP_LABEL: Record<Backdrop, string> = { clear: 'See-through', theme: 'Theme', dark: 'Dark', chroma: 'Green screen' }

interface Prefs {
  scale: number
  backdrop: Backdrop
  /** Backdrop opacity, 0–1 (the combos themselves stay fully visible). */
  opacity: number
}

function loadPrefs(key: string, defaults: Partial<Prefs>): Prefs {
  const base: Prefs = { scale: 1, backdrop: BACKDROPS[0], opacity: 0.85, ...defaults }
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}')
    return { ...base, ...v, backdrop: BACKDROPS.includes(v.backdrop) ? v.backdrop : base.backdrop }
  } catch {
    return base
  }
}

export function FloatingShell({ prefKey, title, theme, extraTools, children, defaults = {} }: {
  prefKey: string
  title: string
  theme: Theme
  extraTools?: ReactNode
  defaults?: Partial<Prefs>
  children: (scale: number) => ReactNode
}) {
  const [prefs, setPrefs] = useState(() => loadPrefs(prefKey, defaults))
  const [locked, setLocked] = useState(overlaysLocked)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(prefKey, JSON.stringify(prefs))
    } catch {
      // Not remembering size is harmless.
    }
  }, [prefKey, prefs])

  useEffect(() => {
    document.title = title
    document.documentElement.classList.add('is-overlay')
    void applyClickThrough(overlaysLocked())
    return onOverlayLock((l) => {
      setLocked(l)
      void applyClickThrough(l)
    })
  }, [title])

  // Desktop: shrink-wrap the window around the content.
  useLayoutEffect(() => {
    if (!isDesktop || !contentRef.current) return
    const el = contentRef.current
    const ro = new ResizeObserver(() => void fitWindow(el.scrollWidth + 2, el.scrollHeight + 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const setScale = (f: (s: number) => number) =>
    setPrefs((p) => ({ ...p, scale: Math.min(3, Math.max(0.4, +f(p.scale).toFixed(2))) }))

  const css = themeToCss(theme) as React.CSSProperties
  const backdropStyle: React.CSSProperties =
    prefs.backdrop === 'theme' && theme.gradPinned && theme.gradient
      ? { background: `linear-gradient(to bottom, ${theme.gradient[0]}, ${theme.gradient[3]})` }
      : {}

  return (
    <div
      className={`overlay${locked ? ' is-locked' : ''}`}
      style={css}
      onMouseDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, select')) startWindowDrag()
      }}
      onWheel={(e) => setScale((s) => s + (e.deltaY < 0 ? 0.05 : -0.05))}
    >
      <div ref={contentRef} className="overlay-content">
        <div className={`overlay-backdrop backdrop-${prefs.backdrop}`} style={{ ...backdropStyle, opacity: prefs.backdrop === 'clear' ? 0 : prefs.opacity }} />
        <div className="overlay-tools">
          <button className="icon-btn" onClick={() => setScale((s) => s - 0.1)} title="Smaller (or scroll down)"><Minus size={14} /></button>
          <span className="overlay-scale">{Math.round(prefs.scale * 100)}%</span>
          <button className="icon-btn" onClick={() => setScale((s) => s + 0.1)} title="Larger (or scroll up)"><Plus size={14} /></button>
          <button
            className="btn btn-small"
            onClick={() => setPrefs((p) => ({ ...p, backdrop: BACKDROPS[(BACKDROPS.indexOf(p.backdrop) + 1) % BACKDROPS.length] }))}
            title="Change background"
          >
            {BACKDROP_LABEL[prefs.backdrop]}
          </button>
          {prefs.backdrop !== 'clear' && prefs.backdrop !== 'chroma' && (
            <input
              type="range" min={0.2} max={1} step={0.05} value={prefs.opacity}
              onChange={(e) => setPrefs((p) => ({ ...p, opacity: Number(e.target.value) }))}
              title="Background opacity" aria-label="Background opacity"
            />
          )}
          {extraTools}
          {isDesktop && <button className="icon-btn" onClick={() => void closeWindow()} title="Close"><X size={14} /></button>}
        </div>
        <div className={`overlay-body is-${prefs.backdrop}`}>{children(prefs.scale)}</div>
      </div>
    </div>
  )
}

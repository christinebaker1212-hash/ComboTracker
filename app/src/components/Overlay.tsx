import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Combo } from '../core/combos'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import { DEFAULT_THEME, themeToCss, type Theme } from '../core/theme'
import {
  applyClickThrough, closeWindow, fitWindow, isDesktop, onOverlayLock, onStateChanged, startWindowDrag,
} from '../platform'
import { STORAGE_EVENT_KEY, type Player } from '../store/useStore'
import { TokenView } from './TokenView'

interface Snapshot {
  combos: Combo[]
  glyph: string
  theme: Theme
  scale: number
}

function read(player: Player): Snapshot {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_EVENT_KEY) ?? '{}')
    return {
      combos: d.lists?.[player] ?? [],
      glyph: d.glyph ?? 'Default',
      theme: d.theme ?? DEFAULT_THEME,
      scale: d.pinScale ?? 1,
    }
  } catch {
    return { combos: [], glyph: 'Default', theme: DEFAULT_THEME, scale: 1 }
  }
}

type Backdrop = 'clear' | 'theme' | 'dark' | 'chroma'
// A see-through window only exists on desktop; in a browser, start with the theme colour.
const BACKDROPS: Backdrop[] = isDesktop ? ['clear', 'dark', 'theme', 'chroma'] : ['theme', 'dark', 'chroma']
const BACKDROP_LABEL: Record<Backdrop, string> = {
  clear: 'See-through', theme: 'Theme', dark: 'Dark', chroma: 'Green screen',
}

const prefKey = (p: Player) => `combotracker:overlay:${p}`
function loadPrefs(p: Player): { scale: number; backdrop: Backdrop } {
  try {
    const v = JSON.parse(localStorage.getItem(prefKey(p)) ?? '{}')
    return { scale: v.scale ?? 1, backdrop: BACKDROPS.includes(v.backdrop) ? v.backdrop : BACKDROPS[0] }
  } catch {
    return { scale: 1, backdrop: BACKDROPS[0] }
  }
}

/**
 * Pinned combos in their own window, updating live as you edit. On desktop it
 * floats see-through on top of your game; lock it from the main window to let
 * clicks pass through.
 */
export function Overlay({ player }: { player: Player }) {
  const [snap, setSnap] = useState(() => read(player))
  const [prefs, setPrefs] = useState(() => loadPrefs(player))
  const [locked, setLocked] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const { scale, backdrop } = prefs

  useEffect(() => {
    try {
      localStorage.setItem(prefKey(player), JSON.stringify(prefs))
    } catch {
      // Not persisting overlay size is harmless.
    }
  }, [player, prefs])

  useEffect(() => {
    const refresh = () => setSnap(read(player))
    const onStorage = (e: StorageEvent) => e.key === STORAGE_EVENT_KEY && refresh()
    window.addEventListener('storage', onStorage)
    const unState = onStateChanged(refresh)
    const unLock = onOverlayLock(player, (l) => {
      setLocked(l)
      void applyClickThrough(l)
    })
    document.title = `Overlay · Player ${player[1]}`
    document.documentElement.classList.add('is-overlay')
    return () => {
      window.removeEventListener('storage', onStorage)
      unState()
      unLock()
    }
  }, [player])

  const glyph = BUILTIN_GLYPHS.find((g) => g.name === snap.glyph) ?? BUILTIN_GLYPHS[0]
  const pinned = snap.combos.filter((c) => c.pinned)
  const size = Math.round(34 * scale)
  const setScale = (f: (s: number) => number) =>
    setPrefs((p) => ({ ...p, scale: Math.min(3, Math.max(0.4, +f(p.scale).toFixed(2))) }))

  // Desktop: shrink-wrap the window around the combos.
  useLayoutEffect(() => {
    if (!isDesktop || !contentRef.current) return
    const el = contentRef.current
    const ro = new ResizeObserver(() => void fitWindow(el.scrollWidth + 2, el.scrollHeight + 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className={`overlay backdrop-${backdrop}${locked ? ' is-locked' : ''}`}
      style={themeToCss(snap.theme) as React.CSSProperties}
      onMouseDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest('button')) startWindowDrag()
      }}
      onWheel={(e) => setScale((s) => s + (e.deltaY < 0 ? 0.05 : -0.05))}
    >
      <div ref={contentRef} className="overlay-content">
        <div className="overlay-tools">
          <button className="icon-btn" onClick={() => setScale((s) => s - 0.1)} title="Smaller (or scroll)"><Minus size={14} /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button className="icon-btn" onClick={() => setScale((s) => s + 0.1)} title="Larger (or scroll)"><Plus size={14} /></button>
          <button
            className="btn"
            onClick={() => setPrefs((p) => ({ ...p, backdrop: BACKDROPS[(BACKDROPS.indexOf(p.backdrop) + 1) % BACKDROPS.length] }))}
            title="Change background"
          >
            {BACKDROP_LABEL[backdrop]}
          </button>
          {isDesktop && (
            <button className="icon-btn" onClick={() => void closeWindow()} title="Close overlay"><X size={14} /></button>
          )}
        </div>
        {pinned.length ? (
          <ul className="overlay-list">
            {pinned.map((c) => (
              <li key={c.id} className={c.child ? 'is-child' : ''}>
                <div className="overlay-name" style={{ fontSize: Math.max(11, size * 0.42) }}>{c.name}</div>
                <div className="overlay-tokens">
                  {c.tokens.map((t, i) =>
                    t === 'newline' ? <span key={i} className="tok-break" /> : <TokenView key={i} token={t} glyph={glyph} size={size} />,
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="overlay-empty">Pin combos in the main window (the pin button on each row) and they'll appear here.</p>
        )}
      </div>
    </div>
  )
}

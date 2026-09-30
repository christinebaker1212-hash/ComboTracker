import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Combo } from '../core/combos'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import { DEFAULT_THEME, themeToCss, type Theme } from '../core/theme'
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

type Backdrop = 'theme' | 'dark' | 'chroma'
const BACKDROPS: Backdrop[] = ['theme', 'dark', 'chroma']

/**
 * Pinned combos in their own window. Updates live as you edit in the main
 * window. The green-screen backdrop can be keyed out in OBS.
 */
export function Overlay({ player }: { player: Player }) {
  const [snap, setSnap] = useState(() => read(player))
  const [scale, setScale] = useState(snap.scale)
  const [backdrop, setBackdrop] = useState<Backdrop>('theme')

  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_EVENT_KEY && setSnap(read(player))
    window.addEventListener('storage', onStorage)
    document.title = `Overlay · Player ${player[1]}`
    return () => window.removeEventListener('storage', onStorage)
  }, [player])

  const glyph = BUILTIN_GLYPHS.find((g) => g.name === snap.glyph) ?? BUILTIN_GLYPHS[0]
  const pinned = snap.combos.filter((c) => c.pinned)
  const size = Math.round(34 * scale)

  return (
    <div className={`overlay backdrop-${backdrop}`} style={themeToCss(snap.theme) as React.CSSProperties}>
      <div className="overlay-tools">
        <button className="icon-btn" onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(1)))} title="Smaller"><Minus size={14} /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button className="icon-btn" onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(1)))} title="Larger"><Plus size={14} /></button>
        <button className="btn" onClick={() => setBackdrop(BACKDROPS[(BACKDROPS.indexOf(backdrop) + 1) % BACKDROPS.length])}>
          Backdrop: {backdrop}
        </button>
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
  )
}

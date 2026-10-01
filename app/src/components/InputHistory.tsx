import { Eraser, ListOrdered } from 'lucide-react'
import { useState } from 'react'
import type { GlyphPack } from '../core/glyphs'
import { NEUTRAL } from '../core/tokens'
import { useInputHistory } from '../hooks/useInputHistory'
import { useShared } from '../hooks/useShared'
import { FloatingShell } from './Floating'
import { TokenView } from './TokenView'

/** The rows themselves, newest at the top. Shared by the history window and the input viewer. */
export function HistoryList({ padIndex, glyph, scale = 1, rows = 20 }: { padIndex: number | null; glyph: GlyphPack; scale?: number; rows?: number }) {
  const entries = useInputHistory(padIndex, glyph, rows)
  const size = Math.round(22 * scale)
  if (!entries.length) return <p className="overlay-empty">Press something on your controller…</p>
  return (
    <ol className="history" style={{ fontSize: 13 * scale }}>
      {entries.map((e, i) => (
        <li key={`${e.start}-${i}`} className={i === 0 ? 'is-newest' : ''}>
          <span className="history-frames">{e.shown}</span>
          <span className="history-dir">
            <TokenView token={e.dir ?? NEUTRAL} glyph={glyph} size={size} />
          </span>
          <span className="history-buttons">
            {e.buttons.map((b) => (
              <span key={b} className={e.fresh.includes(b) ? 'is-fresh' : 'is-held'}>
                <TokenView token={b} glyph={glyph} size={size} />
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The input history in its own floating window, for streams and the lab. */
export function InputHistoryWindow() {
  const { glyph, theme, settings } = useShared()
  const [key, setKey] = useState(0)
  return (
    <FloatingShell
      prefKey="combotracker:history"
      title="Input history"
      theme={theme}
      extraTools={
        <button className="icon-btn" onClick={() => setKey((k) => k + 1)} title="Clear the history">
          <Eraser size={14} />
        </button>
      }
    >
      {(scale) => (
        <div className="history-window">
          <span className="history-title"><ListOrdered size={13} /> Inputs · frames</span>
          <HistoryList key={key} padIndex={settings.padIndex} glyph={glyph} scale={scale} />
        </div>
      )}
    </FloatingShell>
  )
}

import type { Player } from '../store/useStore'
import { useShared } from '../hooks/useShared'
import { FloatingShell } from './Floating'
import { TokenView } from './TokenView'

/**
 * Pinned combos in their own window, updating live as you edit. With a
 * `comboId` it shows just that combo (one-window-per-combo mode).
 */
export function Overlay({ player, comboId }: { player: Player; comboId?: string }) {
  const { lists, glyph, theme } = useShared()
  const combos = (lists[player] ?? []).filter((c) => (comboId ? c.id === comboId : c.pinned))

  return (
    <FloatingShell
      prefKey={`combotracker:overlay:${player}${comboId ? `:${comboId}` : ''}`}
      title={comboId ? `${combos[0]?.name ?? 'Combo'} · overlay` : `Overlay · Player ${player[1]}`}
      theme={theme}
    >
      {(scale) => {
        const size = Math.round(34 * scale)
        if (!combos.length) {
          return (
            <p className="overlay-empty">
              {comboId ? 'This combo was deleted.' : 'Pin combos with the 📌 button on each row and they’ll appear here.'}
            </p>
          )
        }
        return (
          <ul className="overlay-list">
            {combos.map((c) => (
              <li key={c.id} className={c.child && !comboId ? 'is-child' : ''} style={{ ['--s' as string]: scale }}>
                {c.name && <div className="overlay-name" style={{ fontSize: Math.max(11, size * 0.42) }}>{c.name}</div>}
                <div className="overlay-tokens">
                  {c.tokens.map((t, i) =>
                    t === 'newline' ? <span key={i} className="tok-break" /> : <TokenView key={i} token={t} glyph={glyph} size={size} />,
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      }}
    </FloatingShell>
  )
}

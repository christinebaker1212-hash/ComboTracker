import { Search } from 'lucide-react'
import { useState } from 'react'
import { initials, type Entry } from '../characters'

/** Searchable character picker, grouped by game. */
export function CharacterPicker({ list: all, current, onPick, game: onlyGame }: {
  list: Entry[]
  current?: string
  onPick: (ref: string) => void
  /** Show one game's characters only, without the game tabs. */
  game?: string
}) {
  const [q, setQ] = useState('')
  const list = onlyGame ? all.filter((e) => e.game === onlyGame) : all
  const games = onlyGame ? [] : [...new Set(list.map((e) => e.game))]
  const currentGame = list.find((e) => e.ref === current)?.game
  const [game, setGame] = useState<string>(onlyGame ?? currentGame ?? 'All')
  const shown = list.filter(
    (e) => (game === 'All' || e.game === game) && (!q || `${e.character} ${e.game}`.toLowerCase().includes(q.toLowerCase())),
  )
  return (
    <div className="picker-panel">
      <div className="ml-search">
        <Search size={15} />
        <input autoFocus placeholder="Search characters, e.g. Ryu" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && shown[0] && onPick(shown[0].ref)} />
      </div>
      {games.length > 1 && <div className="game-chips" role="tablist">
        {['All', ...games].map((g) => (
          <button key={g} role="tab" aria-selected={game === g} className={`chip-btn${game === g ? ' is-on' : ''}`} onClick={() => setGame(g)}>{g}</button>
        ))}
      </div>}
      <div className="char-grid">
        {shown.map((e) => (
          <button key={e.ref} className={`char-card${e.ref === current ? ' is-on' : ''}`} onClick={() => onPick(e.ref)} title={`${e.character} · ${e.game}`}>
            <span className="char-avatar">{initials(e.character)}</span>
            <span className="char-name">{e.character}</span>
            {game === 'All' && <span className="char-game">{e.game}{e.mine ? ' · yours' : ''}</span>}
          </button>
        ))}
        {!shown.length && <p className="field-hint">No characters match “{q}”.</p>}
      </div>
    </div>
  )
}

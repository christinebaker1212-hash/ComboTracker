import { Shuffle } from 'lucide-react'
import { useState } from 'react'
import { openDrill } from '../platform'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal, Segmented } from './ui'

/** Pick combos for a drill: each one landed a number of times clean, in order or shuffled. */
export function DrillDialog() {
  const close = useUI((s) => s.close)
  const player = useStore((s) => s.player)
  const combos = useStore((s) => s.lists[s.player]).filter((c) => c.tokens.length)
  const notify = useStore((s) => s.notify)
  const pinned = combos.filter((c) => c.pinned)
  const [chosen, setChosen] = useState(() => new Set((pinned.length ? pinned : combos).map((c) => c.id)))
  const [reps, setReps] = useState('3')
  const [order, setOrder] = useState<'list' | 'random'>('list')

  const start = async () => {
    const ids = combos.filter((c) => chosen.has(c.id)).map((c) => c.id)
    if (!ids.length) return
    if (!(await openDrill(player, ids, Number(reps), order === 'random'))) {
      notify('Your browser blocked the practice window. Allow pop-ups for this page.', 'error')
      return
    }
    close()
  }
  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Modal
      title="Practice drill"
      subtitle="Work through several combos in one go. Each moves on once you've landed it enough times, then you get a summary."
      onClose={close}
      footer={<>
        <span className="spacer" />
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn btn-accent" onClick={() => void start()} disabled={!chosen.size}>Start drill ({chosen.size})</button>
      </>}
    >
      {combos.length === 0 ? (
        <p className="field-hint">Add some combos first.</p>
      ) : (
        <>
          <div className="drill-pick">
            {combos.map((c) => (
              <label key={c.id} className="drill-item">
                <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{c.name || 'Combo'}</span>
                {c.pinned && <small>pinned</small>}
              </label>
            ))}
          </div>
          <div className="row-gap">
            <Segmented
              label="Clean landings each"
              value={reps}
              onChange={setReps}
              options={['1', '3', '5', '10'].map((n) => ({ value: n, label: `${n}×` }))}
            />
            <Segmented
              label="Order"
              value={order}
              onChange={setOrder}
              options={[{ value: 'list', label: 'In order' }, { value: 'random', label: 'Shuffled' }]}
            />
            <Shuffle size={14} className="muted" aria-hidden />
          </div>
        </>
      )}
    </Modal>
  )
}

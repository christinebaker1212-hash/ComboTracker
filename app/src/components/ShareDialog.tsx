import { Check, ClipboardPaste, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { makeCombo } from '../core/combos'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import { decodeShare, encodeShare } from '../core/share'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { TokenView } from './TokenView'
import { Modal, Segmented } from './ui'

export function ShareDialog({ code: initial }: { code?: string }) {
  const close = useUI((s) => s.close)
  const list = useStore((s) => s.lists[s.player])
  const selectedId = useStore((s) => s.selected[s.player])
  const glyph = useStore((s) => s.glyph)
  const appendList = useStore((s) => s.appendList)
  const replaceList = useStore((s) => s.replaceList)
  const setGlyph = useStore((s) => s.setGlyph)
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<'share' | 'import'>(initial ? 'import' : 'share')
  const [scope, setScope] = useState<'one' | 'pinned' | 'all'>('one')
  const [pasted, setPasted] = useState(initial ?? '')
  const [copied, setCopied] = useState(false)

  const chosen = scope === 'one' ? list.filter((c) => c.id === selectedId) : scope === 'pinned' ? list.filter((c) => c.pinned) : list.filter((c) => c.tokens.length)
  const code = encodeShare(chosen.map((c) => ({ name: c.name, tokens: c.tokens, child: c.child })), glyph.name)

  const decoded = useMemo(() => {
    if (!pasted.trim()) return null
    try {
      return { ok: decodeShare(pasted) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [pasted])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      notify('Copying was blocked. Select the code and press Ctrl+C.', 'error')
    }
  }

  const importCombos = (mode: 'add' | 'replace') => {
    if (!decoded?.ok) return
    const combos = decoded.ok.combos.map((c) => ({ ...makeCombo(c.name, c.tokens), child: !!c.child }))
    const g = BUILTIN_GLYPHS.find((b) => b.name === decoded.ok.glyph)
    if (g && mode === 'replace') setGlyph(g)
    if (mode === 'add') appendList(combos)
    else replaceList(combos)
    useStore.getState().notifyUndo(`Imported ${combos.length} combo${combos.length === 1 ? '' : 's'}`)
    close()
  }

  return (
    <Modal title="Share combos" subtitle="Share codes are plain text: paste them in Discord, a doc, or a video description." onClose={close} wide>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'share', label: 'Get a code' }, { value: 'import', label: 'Use a code' }]} />

      {tab === 'share' ? (
        <section className="form-section">
          <Segmented
            label="What to share"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'one', label: 'Selected combo' },
              { value: 'pinned', label: 'Pinned combos' },
              { value: 'all', label: 'Whole list' },
            ]}
          />
          <p className="field-hint">{chosen.length} combo{chosen.length === 1 ? '' : 's'}.</p>
          <textarea className="input share-code" readOnly value={chosen.length ? code : ''} onFocus={(e) => e.target.select()} placeholder="Nothing to share yet." />
          <button className="btn btn-accent" onClick={copy} disabled={!chosen.length}>
            {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy code</>}
          </button>
        </section>
      ) : (
        <section className="form-section">
          <textarea
            className="input share-code"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste a code that starts with CT1:"
            autoFocus
          />
          <button className="btn" onClick={async () => setPasted(await navigator.clipboard.readText().catch(() => pasted))}>
            <ClipboardPaste size={15} /> Paste from clipboard
          </button>
          {decoded?.error && <p className="notice notice-warn">{decoded.error}</p>}
          {decoded?.ok && (
            <>
              <ul className="share-preview">
                {decoded.ok.combos.map((c, i) => (
                  <li key={i} className={c.child ? 'is-child' : ''}>
                    <strong>{c.name || 'Untitled'}</strong>
                    <div className="overlay-tokens">{c.tokens.map((t, j) => (t === 'newline' ? <span key={j} className="tok-break" /> : <TokenView key={j} token={t} glyph={glyph} size={24} />))}</div>
                  </li>
                ))}
              </ul>
              <div className="row-gap">
                <button className="btn btn-accent" onClick={() => importCombos('add')}>Add to my list</button>
                <button className="btn" onClick={() => importCombos('replace')}>Replace my list</button>
              </div>
            </>
          )}
        </section>
      )}
    </Modal>
  )
}

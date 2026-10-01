import { Gamepad2, Plus, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { iconUrl, useAssets } from '../assets'
import {
  BUILTIN_GLYPHS, iconSource, macroCode, packToFile, resolveIcon, type GlyphPack, type GlyphSource, type Macro,
} from '../core/glyphs'
import { DEFAULT_BUTTON_MAP, PAD_BUTTONS, parsePadCombo, type PadButton } from '../core/input'
import { tokenLabel, type Token } from '../core/tokens'
import { inputBus } from '../inputBus'
import { allGlyphs, useLibrary } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { deleteUser, safeName, writeUser } from '../userdata'
import { Field, Modal } from './ui'
import { pickFile, readImageFile } from '../files'

const SECTIONS: { title: string; tokens: Token[] }[] = [
  { title: 'Buttons', tokens: ['lp', 'mp', 'hp', 'any_p', 'lk', 'mk', 'hk', 'any_k'] },
  { title: 'Directions', tokens: ['upleft', 'up', 'upright', 'left', 'neutral', 'right', 'downleft', 'down', 'downright'] },
  { title: 'Motions', tokens: ['qcf', 'qcb', 'hcf', 'hcb', 'dp', 'rdp', '360'] },
  { title: 'Symbols', tokens: ['plus', 'goes_into', 'newline'] },
]
const ATTACKS: Token[] = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k']

const PAD_LABEL: Record<PadButton, string> = {
  A: 'A / ✕', B: 'B / ○', X: 'X / □', Y: 'Y / △', LB: 'LB / L1', RB: 'RB / R1', LT: 'LT / L2', RT: 'RT / R2',
  BACK: 'Back', START: 'Start', L3: 'L3', R3: 'R3',
}
const padText = (combo: string) => parsePadCombo(combo).map((b) => PAD_LABEL[b]).join(' + ') || 'Not set'

const defaultMappings = () =>
  Object.fromEntries(Object.entries(DEFAULT_BUTTON_MAP).filter(([, t]) => ATTACKS.includes(t)).map(([b, t]) => [t, b]))

/** Waits for the player to press one or more controller buttons together. */
function useButtonCapture(active: boolean, onDone: (buttons: PadButton[]) => void) {
  useEffect(() => {
    if (!active) return
    let held = new Set<PadButton>()
    let best = new Set<PadButton>()
    return inputBus.subscribeRaw((pressed) => {
      if (pressed.size) {
        held = new Set(pressed)
        if (held.size > best.size) best = new Set(held)
      } else if (held.size) {
        onDone([...best])
        held = new Set()
        best = new Set()
      }
    })
  }, [active, onDone])
}

function IconPicker({ token, current, onPick, onClose }: {
  token: Token
  current?: GlyphSource
  onPick: (s: GlyphSource | undefined) => void
  onClose: () => void
}) {
  const { icons } = useAssets()
  const options = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of BUILTIN_GLYPHS) {
      const name = resolveIcon(token, p, icons)
      if (name && !seen.has(name)) seen.set(name, p.name)
    }
    return [...seen].map(([icon, pack]) => ({ icon, pack }))
  }, [token, icons])

  const upload = async () => {
    const f = await pickFile('image/*')
    if (!f) return
    try {
      onPick({ image: await readImageFile(f) })
    } catch (e) {
      useStore.getState().notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <div className="picker" role="dialog" aria-label={`Choose an icon for ${tokenLabel(token)}`}>
      <div className="picker-head">
        <strong>{tokenLabel(token)}</strong>
        <button className="icon-btn" onClick={onClose} title="Close"><X size={15} /></button>
      </div>
      <div className="picker-grid">
        {options.map((o) => (
          <button
            key={o.icon}
            className={`picker-cell${current && 'pack' in current && resolveIcon(token, BUILTIN_GLYPHS.find((b) => b.name === current.pack)!, icons) === o.icon ? ' is-on' : ''}`}
            title={o.pack}
            onClick={() => onPick({ pack: o.pack })}
          >
            <img src={iconUrl(o.icon)} alt={o.pack} />
          </button>
        ))}
        {!options.length && <p className="field-hint">No built-in icons for this one. Upload your own.</p>}
      </div>
      <div className="picker-actions">
        <button className="btn" onClick={upload}><Upload size={14} /> Upload image</button>
        <button className="btn" onClick={() => onPick(undefined)}>Use default</button>
      </div>
    </div>
  )
}

export function GlyphEditor({ edit }: { edit?: string }) {
  const close = useUI((s) => s.close)
  const { icons } = useAssets()
  const userGlyphs = useLibrary((s) => s.userGlyphs)
  const refresh = useLibrary((s) => s.refresh)
  const setGlyph = useStore((s) => s.setGlyph)
  const current = useStore((s) => s.glyph)
  const notify = useStore((s) => s.notify)

  const existing = edit ? userGlyphs.find((g) => g.name === edit) : undefined
  const [name, setName] = useState(existing?.name ?? 'My icons')
  const [tokens, setTokens] = useState<Record<string, GlyphSource>>(existing?.tokens ?? {})
  const [mappings, setMappings] = useState<Record<string, string>>(existing?.mappings ?? defaultMappings())
  const [macros, setMacros] = useState<Macro[]>(existing?.macros ?? BUILTIN_GLYPHS[0].macros.map((m) => ({ ...m })))
  const [picking, setPicking] = useState<Token | null>(null)
  const [capturing, setCapturing] = useState<Token | null>(null)

  const draft: GlyphPack = { name, suffix: '', macros, tokens, mappings, source: 'user' }

  useButtonCapture(!!capturing, (buttons) => {
    if (capturing && buttons.length) setMappings((m) => ({ ...m, [capturing]: buttons.join('+') }))
    setCapturing(null)
  })

  const startFrom = (packName: string) =>
    setTokens(Object.fromEntries(SECTIONS.flatMap((s) => s.tokens).map((t) => [t, { pack: packName }])))

  const save = async () => {
    const clean = safeName(name)
    if (!existing && allGlyphs(userGlyphs).some((g) => g.name === clean)) {
      notify(`There's already an icon style called "${clean}". Pick another name.`, 'error')
      return
    }
    try {
      if (existing && existing.name !== clean) await deleteUser('glyphs', `${safeName(existing.name)}.json`)
      const pack = { ...draft, name: clean, macros: macros.filter((m) => m.name.trim()) }
      await writeUser('glyphs', `${clean}.json`, packToFile(pack))
      await refresh('glyphs')
      setGlyph(pack)
      notify(`Saved icon style "${clean}".`)
      close()
    } catch (e) {
      notify(`Couldn't save: ${e instanceof Error ? e.message : e}`, 'error')
    }
  }

  const remove = async () => {
    if (!existing) return
    const file = `${safeName(existing.name)}.json`
    const wasCurrent = current.name === existing.name
    await deleteUser('glyphs', file)
    await refresh('glyphs')
    if (wasCurrent) setGlyph(BUILTIN_GLYPHS[0])
    notify(`Deleted "${existing.name}".`, 'info', {
      label: 'Undo',
      run: () => void writeUser('glyphs', file, packToFile(existing)).then(() => refresh('glyphs')).then(() => wasCurrent && setGlyph(existing)),
    })
    close()
  }

  const tile = (t: Token) => {
    const src = iconSource(t, draft, icons, iconUrl)
    return (
      <div key={t} className="glyph-tile-wrap">
        <button
          className={`glyph-tile${picking === t ? ' is-on' : ''}${tokens[t] ? ' is-custom' : ''}`}
          onClick={() => setPicking(picking === t ? null : t)}
          title={`${tokenLabel(t)}: click to change`}
        >
          {src ? <img src={src} alt="" /> : <span className="glyph-tile-text">{tokenLabel(t)}</span>}
          <span className="glyph-tile-label">{tokenLabel(t)}</span>
        </button>
        {picking === t && (
          <IconPicker
            token={t}
            current={tokens[t]}
            onClose={() => setPicking(null)}
            onPick={(s) => {
              setTokens((all) => {
                const next = { ...all }
                if (s) next[t] = s
                else delete next[t]
                return next
              })
              setPicking(null)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <Modal
      title={existing ? `Edit “${existing.name}”` : 'New icon style'}
      subtitle="Click any icon to swap it for one from another style, or upload your own picture."
      onClose={close}
      wide="xl"
      footer={
        <>
          {existing && (
            <button className="btn btn-danger-ghost" onClick={remove}><Trash2 size={15} /> Delete style</button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-accent" onClick={save}>Save icon style</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Start from" hint="Sets every icon to one style, then change the ones you want.">
          <select className="input" value="" onChange={(e) => e.target.value && startFrom(e.target.value)}>
            <option value="">Choose a style…</option>
            {BUILTIN_GLYPHS.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </Field>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.title} className="form-section">
          <h3>{s.title}</h3>
          <div className="glyph-grid">{s.tokens.map(tile)}</div>
        </section>
      ))}

      <section className="form-section">
        <h3>Shortcut buttons</h3>
        <p className="field-hint">Buttons that type a whole input at once. Use words and + like <code>mp+mk</code> or <code>right 360 down downright mp</code>.</p>
        <div className="macro-rows">
          {macros.map((m, i) => (
            <div key={i} className="macro-row">
              <input className="input" placeholder="Name, e.g. DRC" value={m.name}
                onChange={(e) => setMacros((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="input mono" placeholder="Input, e.g. mp+mk" value={m.command}
                onChange={(e) => setMacros((all) => all.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)))} />
              {m.name && tile(macroCode(m.name))}
              <button className="icon-btn icon-danger" title="Remove" onClick={() => setMacros((all) => all.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          {macros.length < 6 && (
            <button className="btn" onClick={() => setMacros((all) => [...all, { name: '', command: '' }])}><Plus size={15} /> Add shortcut</button>
          )}
        </div>
      </section>

      <section className="form-section">
        <h3><Gamepad2 size={16} /> Controller buttons</h3>
        <p className="field-hint">Which controller button enters each attack when this style is active. Click <em>Set</em>, then press the button (or several together) on your controller.</p>
        <div className="map-grid">
          {ATTACKS.map((t) => (
            <div key={t} className={`map-row${capturing === t ? ' is-capturing' : ''}`}>
              <span className="map-token">{tokenLabel(t)}</span>
              <span className="map-value">{capturing === t ? 'Press a button…' : padText(mappings[t] ?? '')}</span>
              <select
                className="input input-small"
                value=""
                aria-label={`Choose button for ${tokenLabel(t)}`}
                onChange={(e) => e.target.value && setMappings((m) => ({ ...m, [t]: e.target.value }))}
              >
                <option value="">Pick…</option>
                {PAD_BUTTONS.map((b) => <option key={b} value={b}>{PAD_LABEL[b]}</option>)}
              </select>
              <button className="btn btn-small" onClick={() => setCapturing(capturing === t ? null : t)}>
                {capturing === t ? 'Cancel' : 'Set'}
              </button>
              {mappings[t] && (
                <button className="icon-btn" title="Unmap" onClick={() => setMappings((m) => {
                  const n = { ...m }
                  delete n[t]
                  return n
                })}><X size={14} /></button>
              )}
            </div>
          ))}
        </div>
      </section>
    </Modal>
  )
}

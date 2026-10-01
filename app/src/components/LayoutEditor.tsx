import { Copy, Gamepad2, Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { iconUrl, presetName, useAssets } from '../assets'
import type { PadButton } from '../core/input'
import {
  defaultElement, INPUT_IDS, inputLabel, type ElementType, type Layout, type LayoutElement,
} from '../core/layouts'
import { tokenLabel } from '../core/tokens'
import { inputBus } from '../inputBus'
import { allRefs, loadLayout, presetRef, splitRef, useLibrary } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { deleteUser, safeName, writeUser } from '../userdata'
import { usePadState } from '../hooks/usePadState'
import { LayoutView } from './LayoutView'
import { ColorField, Field, Modal, Segmented } from './ui'
import { pickFile, readImageFile } from '../files'

/** Raw pad button → layout element ID, for "press a button to add it". */
const PAD_TO_ID: Record<PadButton, string> = {
  A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LEFT_SHOULDER', RB: 'RIGHT_SHOULDER', LT: 'LT', RT: 'RT',
  BACK: 'BACK', START: 'START', L3: 'LEFT_THUMB', R3: 'RIGHT_THUMB',
}
const TOKENS = ['', 'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'up', 'down', 'left', 'right', 'start', 'select']
const CONTROLLER_PICTURES = ['xboxone', 'playstation', 'playstation5', 'wiiupro', 'gamecube', 'dreamcast', 'n64', 'snes', 'nes', 'genesis3b', 'genesis6b', 'duke', 'leverlessg13', 'qanba']

const blank = (): Layout => ({ name: 'My controller', bg_image: '', elements: [defaultElement('joystick', 50, 80)] })

export function LayoutEditor({ initialRef }: { initialRef?: string }) {
  const close = useUI((s) => s.close)
  const { icons } = useAssets()
  const glyph = useStore((s) => s.glyph)
  const theme = useStore((s) => s.theme)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const notify = useStore((s) => s.notify)
  const refresh = useLibrary((s) => s.refresh)
  const pad = usePadState(settings.padIndex)

  const [refs, setRefs] = useState<string[]>([])
  const [ref, setRef] = useState<string | undefined>(initialRef)
  const [layout, setLayout] = useState<Layout>(blank)
  const [selected, setSelected] = useState<number | null>(null)
  const [zoom, setZoom] = useState(2)
  const [listening, setListening] = useState(false)
  const drag = useRef<{ i: number; sx: number; sy: number; ex: number; ey: number } | null>(null)

  useEffect(() => void allRefs('layouts').then(setRefs), [])
  useEffect(() => {
    if (!ref) return
    loadLayout(ref).then((l) => {
      setLayout(l)
      setSelected(null)
    }).catch((e: Error) => notify(e.message, 'error'))
  }, [ref, notify])

  const isUser = ref ? splitRef(ref).origin === 'user' : false
  const el = selected !== null ? layout.elements[selected] : null

  const patchEl = (patch: Partial<LayoutElement>) =>
    selected !== null &&
    setLayout((l) => ({ ...l, elements: l.elements.map((e, i) => (i === selected ? { ...e, ...patch } : e)) }))

  const addOrSelect = (id: string) => {
    const existing = layout.elements.findIndex((e) => e.id === id)
    if (existing >= 0) {
      setSelected(existing)
      return
    }
    setLayout((l) => ({ ...l, elements: [...l.elements, defaultElement(id, 120, 80)] }))
    setSelected(layout.elements.length)
  }

  // "Press a button": adds (or selects) the element for whatever is pressed.
  useEffect(() => {
    if (!listening) return
    return inputBus.subscribeRaw((pressed) => {
      const b = [...pressed][0]
      if (!b) return
      addOrSelect(PAD_TO_ID[b])
      setListening(false)
    })
  })

  const onPointerDown = (i: number, e: React.PointerEvent) => {
    e.preventDefault()
    setSelected(i)
    const t = layout.elements[i]
    drag.current = { i, sx: e.clientX, sy: e.clientY, ex: t.x, ey: t.y }
    ;(e.currentTarget as SVGElement).ownerSVGElement?.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const x = Math.round(d.ex + (e.clientX - d.sx) / zoom)
    const y = Math.round(d.ey + (e.clientY - d.sy) / zoom)
    setLayout((l) => ({ ...l, elements: l.elements.map((el2, i) => (i === d.i ? { ...el2, x, y } : el2)) }))
  }

  const save = async (asCopy = false) => {
    const name = safeName(asCopy ? `${layout.name} copy` : layout.name)
    const file = `${name}.json`
    try {
      await writeUser('layouts', file, { ...layout, name })
      await refresh('layouts')
      const newRef = presetRef('user', file)
      setSettings({ viewerLayout: newRef })
      notify(`Saved layout "${name}". The input viewer now uses it.`)
      close()
    } catch (e) {
      notify(`Couldn't save: ${e instanceof Error ? e.message : e}`, 'error')
    }
  }

  const remove = async () => {
    if (!ref || !isUser) return
    await deleteUser('layouts', splitRef(ref).path)
    await refresh('layouts')
    if (settings.viewerLayout === ref) setSettings({ viewerLayout: 'builtin:Gamepad/Xbox One.json' })
    notify(`Deleted "${layout.name}".`)
    close()
  }

  return (
    <Modal
      title="Controller layouts"
      subtitle="Drag buttons to move them. Press a button on your controller to see it light up."
      onClose={close}
      wide="xl"
      footer={
        <>
          {isUser && <button className="btn btn-danger-ghost" onClick={remove}><Trash2 size={15} /> Delete</button>}
          <span className="spacer" />
          <button className="btn" onClick={close}>Cancel</button>
          {ref && !isUser && <span className="field-hint">Built-in layouts are saved as your own copy.</span>}
          {isUser && <button className="btn" onClick={() => void save(true)}><Copy size={14} /> Save as copy</button>}
          <button className="btn btn-accent" onClick={() => void save()}>Save & use</button>
        </>
      }
    >
      <div className="layout-editor">
        <div className="layout-stage" onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)}>
          <LayoutView
            layout={layout}
            state={pad}
            glyph={glyph}
            theme={theme}
            scale={zoom}
            look={{ outline: 2, highlight: 3, showImage: true }}
            editing={{ selected, onPointerDown, onBackground: () => setSelected(null) }}
          />
        </div>

        <aside className="layout-side">
          <Field label="Start from">
            <select className="input" value={ref ?? ''} onChange={(e) => (e.target.value ? setRef(e.target.value) : (setRef(undefined), setLayout(blank())))}>
              <option value="">Blank layout</option>
              {refs.map((r) => <option key={r} value={r}>{presetName(splitRef(r).path)}{splitRef(r).origin === 'user' ? ' (yours)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Name">
            <input className="input" value={layout.name} onChange={(e) => setLayout((l) => ({ ...l, name: e.target.value }))} />
          </Field>
          <Field label={`Zoom ${Math.round(zoom * 100)}%`}>
            <input type="range" min={1} max={4} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </Field>

          <details className="disclosure">
            <summary><ImageIcon size={14} /> Controller picture</summary>
            <div className="pic-grid">
              <button className={`pic-cell${!layout.bg_image ? ' is-on' : ''}`} onClick={() => setLayout((l) => ({ ...l, bg_image: '' }))}>None</button>
              {CONTROLLER_PICTURES.filter((p) => icons.has(p)).map((p) => (
                <button key={p} className={`pic-cell${layout.bg_image?.toLowerCase().includes(p) ? ' is-on' : ''}`} onClick={() => setLayout((l) => ({ ...l, bg_image: `${p}.png` }))}>
                  <img src={iconUrl(p)} alt={p} />
                </button>
              ))}
              <button className="pic-cell" onClick={async () => {
                const f = await pickFile('image/*')
                if (!f) return
                try {
                  const url = await readImageFile(f, 800)
                  setLayout((l) => ({ ...l, bg_image: url }))
                } catch (e) {
                  notify(e instanceof Error ? e.message : String(e), 'error')
                }
              }}><Upload size={14} /> Upload</button>
            </div>
          </details>

          <div className="layout-add">
            <button className={`btn${listening ? ' btn-accent' : ''}`} onClick={() => setListening((v) => !v)}>
              <Gamepad2 size={15} /> {listening ? 'Press a button…' : 'Add by pressing'}
            </button>
            <select className="input" value="" onChange={(e) => e.target.value && addOrSelect(e.target.value)} aria-label="Add an input">
              <option value="">Add input…</option>
              {INPUT_IDS.map((id) => <option key={id} value={id}>{inputLabel(id)}{layout.elements.some((e) => e.id === id) ? ' ✓' : ''}</option>)}
            </select>
          </div>

          {el ? (
            <div className="el-props">
              <div className="el-head">
                <strong>{inputLabel(el.id)}</strong>
                <button className="icon-btn icon-danger" title="Remove" onClick={() => {
                  setLayout((l) => ({ ...l, elements: l.elements.filter((_, i) => i !== selected) }))
                  setSelected(null)
                }}><Trash2 size={15} /></button>
              </div>
              <Field label="Lights up for">
                <select className="input" value={el.id} onChange={(e) => patchEl({ id: e.target.value })}>
                  {INPUT_IDS.map((id) => <option key={id} value={id}>{inputLabel(id)}</option>)}
                </select>
              </Field>
              <Field label="Shape">
                <Segmented<ElementType>
                  value={el.type}
                  onChange={(type) => patchEl({ type, size: el.size ?? 14, w: el.w ?? 14, h: el.h ?? 14 })}
                  options={[
                    { value: 'glyph', label: 'Icon' },
                    { value: 'rect', label: 'Box' },
                    { value: 'circle', label: 'Dot' },
                    { value: 'stick', label: 'Stick' },
                  ]}
                />
              </Field>
              {(el.type === 'glyph' || el.type === 'rect') && (
                <Field label="Icon">
                  <select className="input" value={el.token ?? ''} onChange={(e) => patchEl({ token: e.target.value || undefined })}>
                    {TOKENS.map((t) => <option key={t} value={t}>{t ? tokenLabel(t) : 'None'}</option>)}
                  </select>
                </Field>
              )}
              <div className="num-row">
                {el.type === 'rect' ? (
                  <>
                    <Field label="Width"><input className="input" type="number" min={2} value={el.w ?? 14} onChange={(e) => patchEl({ w: Number(e.target.value) })} /></Field>
                    <Field label="Height"><input className="input" type="number" min={2} value={el.h ?? 14} onChange={(e) => patchEl({ h: Number(e.target.value) })} /></Field>
                  </>
                ) : (
                  <Field label="Size"><input className="input" type="number" min={2} value={el.size ?? 14} onChange={(e) => patchEl({ size: Number(e.target.value) })} /></Field>
                )}
              </div>
              <ColorField label="Colour" value={(el.type === 'glyph' ? el.base_color : el.fill_color) ?? ''} allowEmpty
                onChange={(v) => patchEl(el.type === 'glyph' ? { base_color: v } : { fill_color: v })} />
              <ColorField label="Pressed colour" value={el.hl_color ?? ''} allowEmpty onChange={(v) => patchEl({ hl_color: v })} />
            </div>
          ) : (
            <p className="field-hint">Click a button in the preview to change it, or add one above.</p>
          )}

        </aside>
      </div>
    </Modal>
  )
}

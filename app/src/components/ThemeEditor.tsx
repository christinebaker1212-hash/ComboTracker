import { AlertTriangle, Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { compileTheme, contrastRatio, type ThemeFile } from '../core/theme'
import { saveTextFile } from '../platform'
import { useLibrary, presetRef } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { safeName, writeUser } from '../userdata'
import { ColorField, Field, Modal, Segmented, Toggle } from './ui'

const DEFAULT_GRADIENT: [string, string, string, string] = ['#0022AA', '#000055', '#000055', '#000022']


export function ThemeEditor() {
  const close = useUI((s) => s.close)
  const original = useStore((s) => s.theme)
  const originalPath = useStore((s) => s.themePath)
  const setTheme = useStore((s) => s.setTheme)
  const notify = useStore((s) => s.notify)
  const refresh = useLibrary((s) => s.refresh)

  const start = original.source
  const [name, setName] = useState(original.name.endsWith('(edited)') ? original.name : `${original.name} (edited)`)
  const [mode, setMode] = useState<'solid' | 'gradient'>(start.bg_grad ? 'gradient' : 'solid')
  const [file, setFile] = useState<ThemeFile>({
    bg: original.bg,
    font: original.font,
    highlight: original.highlight,
    entry_bg: original.entryBg,
    btn_bg: original.btnBg,
    palette_style: original.paletteStyle,
    bg_grad: start.bg_grad ?? DEFAULT_GRADIENT,
    ui_bg_mode: start.ui_bg_mode ?? 'Auto',
    grad_main_bg: start.grad_main_bg ?? false,
    grad_btns_and_highlights: start.grad_btns_and_highlights ?? false,
    grad_standard_btns: start.grad_standard_btns ?? false,
    grad_combos: start.grad_combos ?? true,
    grad_pinned: start.grad_pinned ?? true,
  })
  const saved = useRef(false)

  const payload = (): ThemeFile => {
    const base = { palette_style: file.palette_style }
    const colours = { bg: file.bg, font: file.font, highlight: file.highlight, entry_bg: file.entry_bg, btn_bg: file.btn_bg }
    if (mode === 'solid') return { ...base, ...colours }
    return {
      ...base,
      bg_grad: file.bg_grad,
      ui_bg_mode: file.ui_bg_mode,
      grad_main_bg: file.grad_main_bg,
      grad_btns_and_highlights: file.grad_btns_and_highlights,
      grad_standard_btns: file.grad_standard_btns,
      grad_combos: file.grad_combos,
      grad_pinned: file.grad_pinned,
      ...(file.ui_bg_mode === 'Custom' ? colours : {}),
    }
  }

  // Live preview: every change restyles the app immediately.
  const preview = compileTheme(name, payload())
  useEffect(() => {
    setTheme(preview, originalPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(payload()), name])

  const cancel = () => {
    if (!saved.current) setTheme(original, originalPath)
    close()
  }

  const set = (patch: Partial<ThemeFile>) => setFile((f) => ({ ...f, ...patch }))
  const setCorner = (i: number, v: string) => {
    const g = [...(file.bg_grad ?? DEFAULT_GRADIENT)] as [string, string, string, string]
    g[i] = v
    set({ bg_grad: g })
  }

  const save = async () => {
    const fileName = `${safeName(name)}.json`
    try {
      await writeUser('themes', fileName, payload())
      await refresh('themes')
      saved.current = true
      setTheme(compileTheme(safeName(name), payload()), presetRef('user', fileName))
      notify(`Saved theme "${safeName(name)}". Find it under Theme → My themes.`)
      close()
    } catch (e) {
      notify(`Couldn't save the theme: ${e instanceof Error ? e.message : e}`, 'error')
    }
  }

  const lowContrast = contrastRatio(preview.font, preview.bg) < 4.5
  const g = file.bg_grad ?? DEFAULT_GRADIENT
  const showColours = mode === 'solid' || file.ui_bg_mode === 'Custom'

  return (
    <Modal
      title="Customize theme"
      subtitle="Changes preview live. Save to keep them, or Cancel to go back."
      onClose={cancel}
      wide
      footer={
        <>
          <button
            className="btn"
            onClick={() => void saveTextFile(`${safeName(name)}.json`, JSON.stringify(payload(), null, 2))}
            title="Save the theme as a file to share"
          >
            <Download size={15} /> Export file
          </button>
          <span className="spacer" />
          <button className="btn" onClick={cancel}>Cancel</button>
          <button className="btn btn-accent" onClick={save}>Save theme</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Theme name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Colouring">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'solid', label: 'Solid colours' },
              { value: 'gradient', label: 'Gradient' },
            ]}
          />
        </Field>
      </div>

      {mode === 'gradient' && (
        <section className="form-section">
          <h3>Gradient</h3>
          <div className="grad-editor">
            <div
              className="grad-preview"
              style={{
                background: `linear-gradient(to right, ${g[0]}, ${g[1]})`,
                ['--g2' as string]: g[2],
                ['--g3' as string]: g[3],
              }}
              aria-hidden
            />
            <div className="grad-corners">
              <ColorField label="Top left" value={g[0]} onChange={(v) => setCorner(0, v)} />
              <ColorField label="Top right" value={g[1]} onChange={(v) => setCorner(1, v)} />
              <ColorField label="Bottom left" value={g[2]} onChange={(v) => setCorner(2, v)} />
              <ColorField label="Bottom right" value={g[3]} onChange={(v) => setCorner(3, v)} />
            </div>
          </div>
          <h4>Show the gradient on</h4>
          <div className="toggle-grid">
            <Toggle label="Window background" checked={!!file.grad_main_bg} onChange={(v) => set({ grad_main_bg: v })} />
            <Toggle label="Combo rows" checked={!!file.grad_combos} onChange={(v) => set({ grad_combos: v })} />
            <Toggle label="Palette buttons" checked={!!file.grad_btns_and_highlights} onChange={(v) => set({ grad_btns_and_highlights: v })} />
            <Toggle label="Other buttons" checked={!!file.grad_standard_btns} onChange={(v) => set({ grad_standard_btns: v })} />
            <Toggle label="Overlay backdrop" hint="When the overlay uses the Theme backdrop" checked={!!file.grad_pinned} onChange={(v) => set({ grad_pinned: v })} />
          </div>
          <Field label="Interface colours">
            <Segmented
              value={file.ui_bg_mode ?? 'Auto'}
              onChange={(v) => set({ ui_bg_mode: v })}
              options={[
                { value: 'Auto', label: 'Match the gradient', hint: 'Colours are worked out from the gradient' },
                { value: 'Custom', label: 'Choose my own' },
              ]}
            />
          </Field>
        </section>
      )}

      {showColours && (
        <section className="form-section">
          <h3>Colours</h3>
          <div className="color-grid">
            <ColorField label="Background" hint="Behind everything" value={file.bg ?? ''} onChange={(v) => set({ bg: v })} />
            <ColorField label="Text" value={file.font ?? ''} onChange={(v) => set({ font: v })} />
            <ColorField label="Panels & fields" hint="Rows, text boxes, menus" value={file.entry_bg ?? ''} onChange={(v) => set({ entry_bg: v })} />
            <ColorField label="Buttons" value={file.btn_bg ?? ''} onChange={(v) => set({ btn_bg: v })} />
            <ColorField label="Accent" hint="Selection, highlights, attack chips" value={file.highlight ?? ''} onChange={(v) => set({ highlight: v })} />
          </div>
        </section>
      )}

      <section className="form-section">
        <h3>Palette buttons</h3>
        <Segmented
          value={file.palette_style === 'Classic' ? 'Classic' : 'Modern'}
          onChange={(v) => set({ palette_style: v })}
          options={[
            { value: 'Modern', label: 'Flat' },
            { value: 'Classic', label: 'Raised' },
          ]}
        />
      </section>

      {lowContrast && (
        <p className="notice notice-warn">
          <AlertTriangle size={16} /> Text may be hard to read on this background. Try a lighter or darker text colour.
        </p>
      )}
    </Modal>
  )
}

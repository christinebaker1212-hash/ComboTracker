import { FolderOpen, Gamepad2, Keyboard, MonitorUp, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { presetName } from '../assets'
import { connectedPads, type PadButton } from '../core/input'
import { inputBus } from '../inputBus'
import { isDesktop, openViewer } from '../platform'
import { allRefs, splitRef } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { openUserFolder, userFolderLabel } from '../userdata'
import { SHORTCUTS } from '../shortcuts'
import { Field, Modal, Segmented, Toggle } from './ui'


function PadTester() {
  const [pressed, setPressed] = useState<PadButton[]>([])
  useEffect(() => {
    // Only listens; doesn't block combo input.
    const un = inputBus.subscribe(() => {})
    let last = ''
    const raw = inputBus.subscribeRaw((p) => {
      const key = [...p].join()
      if (key !== last) {
        last = key
        setPressed([...p])
      }
    })
    return () => {
      un()
      raw()
    }
  }, [])
  return (
    <div className="pad-test" aria-live="polite">
      {pressed.length ? pressed.map((b) => <span key={b} className="key-chip">{b}</span>) : <span className="field-hint">Press buttons to test…</span>}
    </div>
  )
}

export function SettingsPanel() {
  const close = useUI((s) => s.close)
  const open = useUI((s) => s.open)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [pads, setPads] = useState(() => connectedPads())
  const [layouts, setLayouts] = useState<string[]>([])

  useEffect(() => {
    const update = () => setPads(connectedPads())
    window.addEventListener('gamepadconnected', update)
    window.addEventListener('gamepaddisconnected', update)
    void allRefs('layouts').then(setLayouts)
    return () => {
      window.removeEventListener('gamepadconnected', update)
      window.removeEventListener('gamepaddisconnected', update)
    }
  }, [])

  return (
    <Modal title="Settings" onClose={close} wide footer={<><span className="spacer" /><button className="btn btn-accent" onClick={close}>Done</button></>}>
      <section className="form-section">
        <h3><Gamepad2 size={16} /> Controller</h3>
        <Field label="Use this controller" hint={pads.length ? undefined : 'No controller found. Plug one in and press any button.'}>
          <select
            className="input"
            value={settings.padIndex ?? 'auto'}
            onChange={(e) => setSettings({ padIndex: e.target.value === 'auto' ? null : Number(e.target.value) })}
          >
            <option value="auto">First one connected</option>
            {pads.map((p) => <option key={p.index} value={p.index}>{p.index + 1}: {p.id.replace(/\(.*?\)/g, '').trim() || 'Controller'}</option>)}
          </select>
        </Field>
        <Toggle
          label="Enter combos with the controller"
          hint="Turn off to keep a connected pad from typing into combos. The input viewer and practice mode still work."
          checked={settings.padInput}
          onChange={(v) => setSettings({ padInput: v })}
        />
        <PadTester />
      </section>

      <section className="form-section">
        <h3><MonitorUp size={16} /> Overlay</h3>
        <Segmented
          label="Overlay windows"
          value={settings.overlayMode}
          onChange={(v) => setSettings({ overlayMode: v })}
          options={[
            { value: 'combined', label: 'One window, all pinned combos' },
            { value: 'separate', label: 'A window per pinned combo' },
          ]}
        />
        <p className="field-hint">
          {settings.overlayMode === 'combined'
            ? 'Press Overlay in the top bar to show every pinned combo in one window.'
            : 'Pinning a combo opens its own window; unpinning closes it. Arrange them anywhere on screen.'}
          {' '}Size, backdrop and opacity are set on the overlay itself (hover over it).
        </p>
      </section>

      <section className="form-section">
        <h3>Input viewer</h3>
        <p className="field-hint">Shows your controller and lights up buttons as you press them. Handy for streams and tutorials.</p>
        <div className="row-gap">
          <select
            className="input"
            value={settings.viewerLayout ?? ''}
            onChange={(e) => setSettings({ viewerLayout: e.target.value || null })}
            aria-label="Controller layout"
          >
            {layouts.map((r) => {
              const { origin, path } = splitRef(r)
              return <option key={r} value={r}>{path.includes('/') ? `${path.split('/')[0]} · ` : ''}{presetName(path)}{origin === 'user' ? ' (yours)' : ''}</option>
            })}
          </select>
          <button className="btn btn-accent" onClick={() => void openViewer()}>Show viewer</button>
          <button className="btn" onClick={() => open({ kind: 'layout', ref: settings.viewerLayout ?? undefined })}><Pencil size={14} /> Edit layouts</button>
        </div>
      </section>

      <section className="form-section">
        <h3><FolderOpen size={16} /> Your files</h3>
        {isDesktop ? (
          <>
            <p className="field-hint">
              Themes, icon styles, layouts and presets you save go in <code>{userFolderLabel()}</code>.
              Drop other people's files into the matching folder to use them.
            </p>
            <button className="btn" onClick={() => void openUserFolder()}><FolderOpen size={15} /> Open folder</button>
          </>
        ) : (
          <p className="field-hint">In the browser, things you save are kept in this browser only. Use Save / Export to keep copies as files.</p>
        )}
      </section>

      <section className="form-section">
        <h3><Keyboard size={16} /> Keyboard shortcuts</h3>
        <dl className="shortcuts">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>
          ))}
        </dl>
      </section>
    </Modal>
  )
}

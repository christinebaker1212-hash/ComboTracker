import { Command, FolderOpen, Gamepad2, Keyboard, Lightbulb, Monitor, MonitorUp, Pencil, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { presetName } from '../assets'
import type { PadButton } from '../core/input'
import { DEFAULT_KEYBOARD, DEFAULT_KEYMAP, KEY_ROLES, keyLabel, type KeyboardSettings } from '../core/keyboard'
import { connectedPads, NATIVE_INDEX_BASE } from '../nativePads'
import { inputBus } from '../inputBus'
import { isDesktop, openViewer } from '../platform'
import { allRefs, splitRef } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { openUserFolder, userFolderLabel } from '../userdata'
import { SHORTCUTS } from '../shortcuts'
import { HOTKEYS, hotkeyLabel } from '../hotkeys'
import { useTips } from '../store/useTips'
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

/** Keyboard / hitbox play: turn it on, pick SOCD cleaning, and remap keys by pressing them. */
function KeyboardSection() {
  const kb = useStore((s) => s.settings.keyboard ?? DEFAULT_KEYBOARD)
  const setSettings = useStore((s) => s.setSettings)
  const [waiting, setWaiting] = useState<number | null>(null)
  const save = (patch: Partial<KeyboardSettings>) => setSettings({ keyboard: { ...kb, ...patch } })

  useEffect(() => {
    if (waiting === null) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape') {
        const map = { ...kb.map }
        map[e.code] = waiting
        setSettings({ keyboard: { ...kb, map } })
      }
      setWaiting(null)
    }
    // Capture phase, so the key doesn't also close the dialog or edit a combo.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [waiting, kb, setSettings])

  const remove = (code: string) => {
    const map = { ...kb.map }
    delete map[code]
    save({ map })
  }

  return (
    <section className="form-section">
      <h3><Keyboard size={16} /> Keyboard &amp; hitbox</h3>
      <Toggle
        label="Play with the keyboard"
        hint={isDesktop
          ? 'Keys act as controller buttons in the editor, input viewer and practice, even while your game has focus. Only the keys below are read. Also for leverless controllers set to keyboard mode.'
          : 'Keys act as controller buttons while this window has focus. Also for leverless controllers set to keyboard mode.'}
        checked={kb.enabled}
        onChange={(v) => save({ enabled: v })}
      />
      {kb.enabled && (
        <>
          <Segmented
            label="Left + right together (SOCD)"
            value={kb.socd}
            onChange={(v) => save({ socd: v })}
            options={[
              { value: 'neutral', label: 'Neutral', hint: 'Left+right = neutral, up+down = up. The tournament standard for hitboxes.' },
              { value: 'last', label: 'Last input wins', hint: 'The direction pressed most recently wins.' },
            ]}
          />
          <div className="keymap">
            {KEY_ROLES.map((role) => {
              const keys = Object.entries(kb.map).filter(([, b]) => b === role.index).map(([code]) => code)
              return (
                <div key={role.index} className="keymap-row">
                  <span className="keymap-role">{role.label}</span>
                  <span className="keymap-keys">
                    {keys.map((code) => (
                      <button key={code} className="key-chip key-chip-btn" onClick={() => remove(code)} title="Click to remove this key">
                        {keyLabel(code)} ×
                      </button>
                    ))}
                    <button
                      className={`btn btn-small${waiting === role.index ? ' is-on' : ''}`}
                      onClick={() => setWaiting(waiting === role.index ? null : role.index)}
                    >
                      {waiting === role.index ? 'Press a key… (Esc cancels)' : '+ Key'}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
          <button className="btn" onClick={() => save({ map: DEFAULT_KEYMAP })}>Reset keys (WASD + U I O / J K L)</button>
        </>
      )}
    </section>
  )
}

export function SettingsPanel() {
  const close = useUI((s) => s.close)
  const open = useUI((s) => s.open)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [pads, setPads] = useState(() => connectedPads())
  const [layouts, setLayouts] = useState<string[]>([])
  const resetTips = useTips((s) => s.reset)

  useEffect(() => {
    const update = () => setPads(connectedPads())
    window.addEventListener('gamepadconnected', update)
    window.addEventListener('gamepaddisconnected', update)
    window.addEventListener('nativepadschanged', update)
    void allRefs('layouts').then(setLayouts)
    return () => {
      window.removeEventListener('gamepadconnected', update)
      window.removeEventListener('gamepaddisconnected', update)
      window.removeEventListener('nativepadschanged', update)
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
            {pads.map((p, i) => (
              <option key={p.index} value={p.index}>
                {i + 1}: {p.id.replace(/\(.*?\)/g, '').trim() || 'Controller'}
                {p.index >= NATIVE_INDEX_BASE ? ' · works while your game has focus' : ''}
              </option>
            ))}
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

      <KeyboardSection />

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
        <h3><Monitor size={16} /> Interface</h3>
        <Segmented
          label="Size"
          value={settings.uiSize}
          onChange={(v) => setSettings({ uiSize: v })}
          options={[
            { value: 'compact', label: 'Compact', hint: 'Fit more combos on screen' },
            { value: 'standard', label: 'Standard' },
            { value: 'large', label: 'Large', hint: 'Bigger buttons and text: easier to hit and read' },
          ]}
        />
        <Toggle
          label="Show tips"
          hint="A short tip next to each feature the first time you see it."
          checked={settings.tips}
          onChange={(v) => setSettings({ tips: v })}
        />
        <div className="row-gap">
          <button className="btn" onClick={() => { resetTips(); setSettings({ tips: true }) }}><Lightbulb size={14} /> Show tips again</button>
          <button className="btn" onClick={() => open({ kind: 'setup' })}><Wand2 size={14} /> Run setup again</button>
        </div>
      </section>

      {isDesktop && (
        <section className="form-section">
          <h3><Command size={16} /> Hotkeys that work in-game</h3>
          <Toggle
            label="Use global hotkeys"
            hint="These work even while your game is focused."
            checked={settings.hotkeys}
            onChange={(v) => setSettings({ hotkeys: v })}
          />
          {settings.hotkeys && (
            <dl className="shortcuts">
              {HOTKEYS.filter((h) => !h.label.startsWith('Scene ')).map((h) => (
                <div key={h.keys}><dt><kbd>{hotkeyLabel(h.keys)}</kbd></dt><dd>{h.label}</dd></div>
              ))}
              <div><dt><kbd>Ctrl+Alt+1 … 9</kbd></dt><dd>Switch to a saved overlay scene</dd></div>
            </dl>
          )}
        </section>
      )}

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

import { Play, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { hotkeyLabel, HOTKEYS } from '../hotkeys'
import { useScenes } from '../overlays'
import { isDesktop } from '../platform'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal } from './ui'

/** Save where the overlay windows are, and bring that arrangement back in one click. */
export function ScenesDialog() {
  const close = useUI((s) => s.close)
  const { scenes, save, apply, remove, rename } = useScenes()
  const hotkeysOn = useStore((s) => s.settings.hotkeys) && isDesktop
  const notify = useStore((s) => s.notify)
  const [name, setName] = useState('')

  const doSave = async () => {
    const scene = await save(name)
    if (scene) {
      setName('')
      notify(`Saved scene “${scene.name}” with ${scene.windows.length} window${scene.windows.length === 1 ? '' : 's'}.`)
    }
  }

  return (
    <Modal
      title="Overlay scenes"
      subtitle="A scene remembers which overlay windows are open, where they sit and how they look. Set things up once per game, then switch in one click."
      onClose={close}
      footer={<><span className="spacer" /><button className="btn btn-accent" onClick={close}>Done</button></>}
    >
      <div className="row-gap">
        <input
          className="input" style={{ flex: 1 }} value={name} placeholder={`Scene ${scenes.length + 1}, e.g. “SF6 · stream”`}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void doSave()}
          aria-label="Scene name"
        />
        <button className="btn btn-accent" onClick={() => void doSave()} title="Save the windows that are open right now">
          <Save size={15} /> Save open windows
        </button>
      </div>
      {scenes.length ? (
        <ul className="scene-list">
          {scenes.map((s, i) => (
            <li key={s.name}>
              <input
                className="scene-name" defaultValue={s.name} aria-label="Scene name"
                onBlur={(e) => e.target.value !== s.name && rename(s.name, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="field-hint">
                {s.windows.length} window{s.windows.length === 1 ? '' : 's'}
                {hotkeysOn && i < 9 ? ` · ${hotkeyLabel(HOTKEYS.find((h) => h.label === `Scene ${i + 1}`)!.keys)}` : ''}
              </span>
              <button className="btn btn-small" onClick={() => void apply(s.name)}><Play size={13} /> Show</button>
              <button className="icon-btn icon-danger" title="Delete scene" onClick={() => remove(s.name)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No scenes yet. Open the overlay and input viewer, arrange them over your game, then save.</p>
      )}
    </Modal>
  )
}

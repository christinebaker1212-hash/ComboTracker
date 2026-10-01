import { useUI } from '../store/useUI'
import { SHORTCUTS } from '../shortcuts'
import { Modal } from './ui'

const STEPS: [string, string][] = [
  ['Pick a combo row', 'Click a row on the right. That’s where input goes. Click inside it to insert in the middle.'],
  ['Enter inputs', 'Click the buttons on the left, press buttons on your controller, or type notation like 2MK > 236HP. Hold a button or direction for a held or charge input.'],
  ['Load ready-made lists', 'Presets → Combos or Command lists loads a whole character. Ctrl+Z undoes it.'],
  ['Put it on screen', 'Pin rows with 📌, then press Overlay. Drag it into place, scroll over it to resize, and lock it so clicks reach your game.'],
  ['Practise', 'The 🎯 button on a row opens a practice window on top of your game. Play the combo and each input lights up; drops are called out.'],
  ['Make it yours', 'Change icon styles and themes from the top bar, or create your own from the bottom of those menus.'],
]

export function HelpDialog() {
  const close = useUI((s) => s.close)
  return (
    <Modal title="How ComboTracker works" onClose={close} wide footer={<><span className="spacer" /><button className="btn btn-accent" onClick={close}>Got it</button></>}>
      <ol className="help-steps">
        {STEPS.map(([title, text], i) => (
          <li key={title}>
            <span className="help-num">{i + 1}</span>
            <div><strong>{title}</strong><p>{text}</p></div>
          </li>
        ))}
      </ol>
      <h3 className="help-sub">Keyboard</h3>
      <dl className="shortcuts">
        {SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}
      </dl>
    </Modal>
  )
}

// Record a combo: play it on the controller and it's written into the
// selected combo, with "dl." where you paused, and your rhythm saved as the
// practice reference. Works while the game has focus (controller input is
// read natively), and stops by itself a few seconds after the last input.
import { create } from 'zustand'
import { insertTokens, mutateLast } from './core/editor'
import { isAtk } from './core/glyphs'
import { toFrames } from './core/practice'
import { note } from './core/tokens'
import { inputBus } from './inputBus'
import { useStore } from './store/useStore'

/** A pause this long between two button presses is written as "dl." (delay). */
export const DELAY_FRAMES = 25
/** Recording ends this long after the last input. */
export const AUTO_STOP_MS = 3000

interface RecorderState {
  comboId: string | null
  toggle(): void
  start(): void
  stop(): void
}

export const useRecorder = create<RecorderState>()((set, get) => {
  let unsubscribe: (() => void) | null = null
  let idle: ReturnType<typeof setTimeout> | undefined
  let pressTimes: number[] = []

  const finish = () => {
    const id = get().comboId
    unsubscribe?.()
    unsubscribe = null
    clearTimeout(idle)
    set({ comboId: null })
    if (!id) return
    const s = useStore.getState()
    const timing = pressTimes.slice(1).map((t, i) => toFrames(t - pressTimes[i]))
    if (pressTimes.length) {
      s.updateCombo(id, { timing }, false)
      s.notify(`Recorded ${pressTimes.length} button press${pressTimes.length === 1 ? '' : 'es'}. Practise it to see your timing against this run.`)
    } else {
      s.notify('Recording stopped: nothing was pressed.')
    }
  }

  return {
    comboId: null,
    toggle: () => (get().comboId ? get().stop() : get().start()),
    stop: finish,
    start: () => {
      if (get().comboId) return
      const s = useStore.getState()
      const id = s.selected[s.player]
      if (!id) return
      s.clearCombo(id)
      s.setCaret(id, null)
      pressTimes = []
      set({ comboId: id })
      s.notify('Recording: play the combo on your controller. It stops 3 seconds after your last input (or press Record again).')
      // Capturing: the normal "controller types into combos" path stands aside while recording.
      unsubscribe = inputBus.subscribe((ev, time) => {
        const st = useStore.getState()
        clearTimeout(idle)
        idle = setTimeout(finish, AUTO_STOP_MS)
        if (ev.type === 'mutate') {
          st.edit((e) => mutateLast(e, ev.from, ev.to))
          return
        }
        const presses = ev.tokens.filter((t) => isAtk(t, st.glyph)).length
        const paused = presses > 0 && pressTimes.length > 0 && toFrames(time - pressTimes[pressTimes.length - 1]) >= DELAY_FRAMES
        st.edit((e, g) => insertTokens(paused ? insertTokens(e, [note('dl.')], g) : e, ev.tokens, g))
        for (let i = 0; i < presses; i++) pressTimes.push(time)
      }, true)
    },
  }
})

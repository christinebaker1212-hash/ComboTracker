// Live controller events for anything that wants them besides the editor
// (practice mode, the "press a button" mapper).
import type { InputEvent, PadButton } from './core/input'

type Listener = (ev: InputEvent, time: number) => void
type RawListener = (pressed: ReadonlySet<PadButton>) => void

const listeners = new Set<Listener>()
const rawListeners = new Set<RawListener>()

/** While any listener says so, controller input stops editing combos. */
let captures = 0

export const inputBus = {
  emit(ev: InputEvent, time: number) {
    listeners.forEach((l) => l(ev, time))
  },
  emitRaw(pressed: ReadonlySet<PadButton>) {
    rawListeners.forEach((l) => l(pressed))
  },
  subscribe(l: Listener, capture = false) {
    listeners.add(l)
    if (capture) captures++
    return () => {
      listeners.delete(l)
      if (capture) captures--
    }
  },
  subscribeRaw(l: RawListener) {
    rawListeners.add(l)
    captures++
    return () => {
      rawListeners.delete(l)
      captures--
    }
  },
  get captured() {
    return captures > 0
  },
}

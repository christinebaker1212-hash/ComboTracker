// Practice sound cues, synthesised with Web Audio (no audio files): a tick
// for each correct input, a chime for a clean combo, a buzz for a drop, and
// a metronome that plays a combo's reference rhythm.
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, length: number, volume: number, type: OscillatorType = 'sine') {
  const a = audio()
  if (!a) return
  const t = a.currentTime + start
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(gain).connect(a.destination)
  osc.start(t)
  osc.stop(t + length + 0.02)
}

export const sounds = {
  /** A correct input. Higher pitch when it was on time. */
  tick(onTime = true) {
    tone(onTime ? 1320 : 880, 0, 0.05, 0.12, 'triangle')
  },
  /** The whole combo landed. */
  clean() {
    tone(880, 0, 0.12, 0.15)
    tone(1175, 0.08, 0.12, 0.15)
    tone(1568, 0.16, 0.22, 0.15)
  },
  /** Dropped. */
  drop() {
    tone(140, 0, 0.22, 0.18, 'sawtooth')
  },
  /** Plays a rhythm: one beep per button press, `gaps` frames apart (60 fps). */
  rhythm(gaps: number[]) {
    let at = 0.05
    tone(1320, at, 0.06, 0.15, 'triangle')
    for (const g of gaps) {
      at += g / 60
      tone(1320, at, 0.06, 0.15, 'triangle')
    }
  },
}

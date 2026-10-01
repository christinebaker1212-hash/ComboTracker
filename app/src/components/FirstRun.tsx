import { Check, Gamepad2, Grid3x3, Joystick, Keyboard } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { entries, type Entry } from '../characters'
import { FAMILIES, PAD_GLYPHS, padFamily, type PadFamily } from '../core/controllers'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import type { Token } from '../core/tokens'
import { applyPadFamily } from '../hooks/usePadSuggest'
import { allRefs, readPreset } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { markSetupDone } from '../setup'
import { CharacterPicker } from './CharacterPicker'
import { TokenView } from './TokenView'
import { Modal } from './ui'

type Family = Exclude<PadFamily, 'generic'>

const FAMILY_ICON: Record<Family, ReactNode> = {
  xbox: <Gamepad2 size={26} />,
  playstation: <Gamepad2 size={26} />,
  nintendo: <Gamepad2 size={26} />,
  stick: <Joystick size={26} />,
  leverless: <Grid3x3 size={26} />,
  keyboard: <Keyboard size={26} />,
}

const SAMPLE: Token[] = ['down', 'mk', 'goes_into', 'qcf', 'hp']

function detectFamily(): Family | null {
  for (const p of navigator.getGamepads?.() ?? []) {
    const f = p && padFamily(p.id)
    if (f && f !== 'generic') return f
  }
  return null
}

/**
 * Three quick questions on first launch (game, character, controller) so the
 * app opens already set up: matching button icons, the right input viewer,
 * and the character's move list ready to pick combos from.
 */
export function FirstRun() {
  const close = useUI((s) => s.close)
  const open = useUI((s) => s.open)
  const [step, setStep] = useState(0)
  const [chars, setChars] = useState<Entry[]>([])
  const [game, setGame] = useState<string | null>(null)
  const [character, setCharacter] = useState<string | null>(null)
  const [glyphOf, setGlyphOf] = useState<{ ref: string; glyph: string | null } | null>(null)
  const [detected, setDetected] = useState<Family | null>(detectFamily)
  const [family, setFamily] = useState<Family>(() => detectFamily() ?? 'xbox')
  const [useGameIcons, setUseGameIcons] = useState(true)

  useEffect(() => void allRefs('commandLists').then((r) => setChars(entries(r).filter((e) => !e.mine))), [])
  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      const f = padFamily(e.gamepad.id)
      if (f === 'generic') return
      setDetected(f)
      setFamily(f)
    }
    window.addEventListener('gamepadconnected', onConnect)
    return () => window.removeEventListener('gamepadconnected', onConnect)
  }, [])

  // The icon style the game's move lists are written in (e.g. BlazBlue's A/B/C/D).
  const sampleRef = character ?? chars.find((c) => c.game === game)?.ref
  useEffect(() => {
    if (!sampleRef) return
    void readPreset('commandLists', sampleRef)
      .then((j) => (j as { glyph?: unknown }).glyph)
      .catch(() => null)
      .then((g) => setGlyphOf({ ref: sampleRef, glyph: typeof g === 'string' ? g : null }))
  }, [sampleRef])
  const gameGlyph = glyphOf && glyphOf.ref === sampleRef ? glyphOf.glyph : null

  const games = useMemo(() => [...new Set(chars.map((c) => c.game))], [chars])
  const gameHasOwnIcons = !!gameGlyph && !PAD_GLYPHS.has(gameGlyph)
  const glyphName = gameHasOwnIcons && useGameIcons ? gameGlyph! : FAMILIES[family].glyph
  const previewGlyph = BUILTIN_GLYPHS.find((g) => g.name === glyphName) ?? BUILTIN_GLYPHS[0]

  const skip = () => {
    markSetupDone()
    close()
  }

  const finish = () => {
    applyPadFamily(family)
    const s = useStore.getState()
    s.setGlyph(previewGlyph)
    markSetupDone()
    if (character) open({ kind: 'moves', ref: character })
    else close()
    s.notify(character ? 'All set. Add moves from the list, or type your own combos.' : 'All set. Click the buttons on the left, use your controller, or type notation like 236HP.')
  }

  const pickGame = (g: string | null) => {
    setGame(g)
    setCharacter(null)
    setStep(g ? 1 : 2)
  }

  const titles = ['What do you play?', 'Who do you play?', 'What do you play on?']
  const subtitles = [
    'Pick a game to get its characters’ move lists. You can change everything later.',
    `Pick your main in ${game ?? 'this game'}. Their move list opens when you’re done.`,
    'So buttons show up the way you see them. Press a button on your controller to detect it.',
  ]

  return (
    <Modal
      title={titles[step]}
      subtitle={subtitles[step]}
      onClose={skip}
      wide
      footer={
        <>
          <div className="steps" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />)}
          </div>
          <span className="spacer" />
          {step > 0 && <button className="btn" onClick={() => setStep(step === 2 && !game ? 0 : step - 1)}>Back</button>}
          {step === 0 && <button className="btn" onClick={skip}>Skip setup</button>}
          {step === 1 && <button className="btn" onClick={() => setStep(2)}>Skip</button>}
          {step === 2 && <button className="btn btn-accent" onClick={finish}><Check size={15} /> Start</button>}
        </>
      }
    >
      {step === 0 && (
        <div className="setup-grid">
          {games.map((g) => (
            <button key={g} className={`setup-card${game === g ? ' is-on' : ''}`} onClick={() => pickGame(g)}>
              <strong>{g}</strong>
              <span>{((n) => `${n} character${n === 1 ? '' : 's'}`)(chars.filter((c) => c.game === g).length)}</span>
            </button>
          ))}
          <button className="setup-card is-quiet" onClick={() => pickGame(null)}>
            <strong>Something else</strong>
            <span>Just write my own combos</span>
          </button>
        </div>
      )}

      {step === 1 && game && (
        <CharacterPicker list={chars} game={game} current={character ?? undefined} onPick={(r) => (setCharacter(r), setStep(2))} />
      )}

      {step === 2 && (
        <>
          <div className="setup-grid setup-grid-small">
            {(Object.keys(FAMILIES) as Family[]).map((f) => (
              <button key={f} className={`setup-card${family === f ? ' is-on' : ''}`} onClick={() => setFamily(f)}>
                {FAMILY_ICON[f]}
                <strong>{FAMILIES[f].label}</strong>
                {detected === f && <span className="setup-badge">Detected</span>}
              </button>
            ))}
          </div>
          {gameHasOwnIcons && (
            <div className="segmented setup-icons" role="radiogroup" aria-label="Button icons">
              <button role="radio" aria-checked={useGameIcons} className={useGameIcons ? 'is-active' : ''} onClick={() => setUseGameIcons(true)}>
                {game}’s own icons
              </button>
              <button role="radio" aria-checked={!useGameIcons} className={!useGameIcons ? 'is-active' : ''} onClick={() => setUseGameIcons(false)}>
                My controller’s buttons
              </button>
            </div>
          )}
          <div className="setup-preview">
            <span className="field-hint">Moves will look like this</span>
            <div className="setup-preview-tokens">
              {SAMPLE.map((t, i) => <TokenView key={i} token={t} glyph={previewGlyph} size={34} />)}
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

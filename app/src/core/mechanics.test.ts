// Icon style data and the newer combo mechanics: neutral, releases, notes,
// per-style button names and Tekken notation.
import { describe, expect, it } from 'vitest'
import { addAttack, insertTokens, type EditState } from './editor'
import { BUILTIN_GLYPHS, isAtk, isDir, labelFor, needsMarker, resolveIcon } from './glyphs'
import { InputInterpreter, INPUT_PROFILES, resolveChord, type Frame } from './input'
import { applyNotation } from './notation'
import { stepsFor } from './practice'
import { decodeShare, encodeShare } from './share'

const pack = (name: string) => BUILTIN_GLYPHS.find((g) => g.name === name)!
const def = pack('Default')
const tekken = pack('Tekken')
const empty: EditState = { tokens: [], cursor: null }
const parse = (text: string, g = def) => applyNotation(empty, text, g, g.macros)

describe('icon styles', () => {
  it('names buttons the way each style draws them', () => {
    expect(labelFor('hp', tekken)).toBe('1+2')
    expect(labelFor('qcf', tekken)).toBe('2+4')
    expect(labelFor('c_left', tekken)).toBe('B')
    expect(labelFor('mk', pack('BlazBlue'))).toBe('C')
    expect(labelFor('hk', pack('Xbox'))).toBe('RT')
    expect(labelFor('h_lp', pack('PlayStation'))).toBe('[□]')
    expect(labelFor('r_hp', def)).toBe(']HP[')
    expect(labelFor('note:CH', def)).toBe('CH')
  })

  it("treats Tekken's ★ (360) as neutral, a direction, not a button", () => {
    expect(isDir('360', tekken)).toBe(true)
    expect(isAtk('qcf', tekken)).toBe(true)
    const icons = new Set(['360_tk', 'middle_np'])
    expect(resolveIcon('neutral', tekken, icons)).toBe('360_tk')
    expect(resolveIcon('neutral', pack('Notation'), icons)).toBe('middle_np')
  })

  it('writes EWGF as f,n,d,d/f+2 and Rage Art as d/f+1+2', () => {
    const ewgf = parse('EWGF', tekken).state.tokens
    expect(ewgf).toEqual(['right', 'neutral', 'down', 'downright', 'plus', 'mp'])
    expect(parse('RA', tekken).state.tokens).toEqual(['downright', 'plus', 'hp'])
  })

  it('gives Nintendo its Switch-style arrows', () => {
    expect(resolveIcon('qcf', pack('Nintendo'), new Set(['qcf', 'qcf_sw']))).toBe('qcf_sw')
  })

  it('only marks holds and releases that have no art of their own', () => {
    const icons = new Set(['lp', 'h_lp_hu', 'lp_hu'])
    expect(needsMarker('h_lp', pack('EventHubs'), icons)).toBe(false)
    expect(needsMarker('h_lp', def, icons)).toBe(true)
    expect(needsMarker('r_lp', def, icons)).toBe(true)
    expect(needsMarker('lp', def, icons)).toBe(false)
  })
})

describe('controller chords', () => {
  it('Persona 4: A+B+C is LP+MP+LK and A+C+D is LP+MP+MK, matching the icons', () => {
    expect(resolveChord(new Set(['lp', 'mp', 'lk']), INPUT_PROFILES['Persona 4'])).toEqual(['any_p'])
    expect(resolveChord(new Set(['lp', 'mp', 'mk']), INPUT_PROFILES['Persona 4'])).toEqual(['any_k'])
  })

  it('Tekken: a quick pass through neutral between directions is recorded', () => {
    const it = new InputInterpreter(undefined, INPUT_PROFILES.Tekken)
    const frame = (time: number, dir: Frame['dir']) => it.update({ time, dir, buttons: new Set() })
    const got: string[] = []
    const take = (evs: ReturnType<typeof frame>) => evs.forEach((e) => e.type === 'insert' && got.push(...e.tokens))
    take(frame(0, 'right'))
    take(frame(20, 'right'))
    take(frame(40, null))
    take(frame(70, 'down'))
    take(frame(90, 'down'))
    take(frame(110, 'downright'))
    take(frame(130, 'downright'))
    expect(got).toEqual(['right', 'neutral', 'down', 'downright'])
  })

  it('does not add neutral outside Tekken, or after a long pause', () => {
    const plain = new InputInterpreter()
    const got: string[] = []
    for (const [t, d] of [[0, 'right'], [20, 'right'], [40, null], [70, 'down'], [90, 'down']] as const) {
      plain.update({ time: t, dir: d, buttons: new Set() }).forEach((e) => e.type === 'insert' && got.push(...e.tokens))
    }
    expect(got).toEqual(['right', 'down'])
  })
})

describe('notation', () => {
  it('reads cr./st. prefixes, notes, releases and neutral', () => {
    expect(parse('cr.MK > st.HP').state.tokens).toEqual(['down', 'plus', 'mk', 'goes_into', 'hp'])
    expect(parse('5LP > CH 5HP').state.tokens).toEqual(['lp', 'goes_into', 'note:CH', 'hp'])
    expect(parse('dl.5MP').state.tokens).toEqual(['note:dl.', 'mp'])
    expect(parse(']HP[').state.tokens).toEqual(['r_hp'])
    expect(parse('6 5 6').state.tokens).toEqual(['right', 'neutral', 'right'])
    expect(parse('2LP "Drive Rush" 5MP').state.tokens).toEqual(['down', 'plus', 'lp', 'goes_into', 'note:Drive Rush', 'mp'])
  })

  it("accepts each style's own button names", () => {
    expect(parse('2B > 5C', pack('BlazBlue')).state.tokens).toEqual(['down', 'plus', 'mp', 'goes_into', 'mk'])
    expect(parse('236HS', pack('Guilty Gear')).state.tokens).toEqual(['qcf', 'plus', 'hp'])
    expect(parse('c.S', pack('Guilty Gear')).state.tokens).toEqual(['down', 'plus', 'mp'])
  })

  it('reads Tekken notation in Tekken styles', () => {
    expect(parse('f,n,d,d/f+2', tekken).state.tokens).toEqual(['right', 'neutral', 'down', 'downright', 'plus', 'mp'])
    expect(parse('df+1, 2', tekken).state.tokens).toEqual(['downright', 'plus', 'lp', 'goes_into', 'mp'])
    expect(parse('1+2', tekken).state.tokens).toEqual(['hp'])
    expect(parse('b+2+4', tekken).state.tokens).toEqual(['left', 'plus', 'qcf'])
    expect(parse('B+1', tekken).state.tokens).toEqual(['c_left', 'plus', 'lp'])
    expect(parse('WS2', tekken).state.tokens).toEqual(['note:WS', 'mp'])
  })
})

describe('editor with notes', () => {
  it('starts a new step after an attack, and joins straight onto what follows', () => {
    let s = addAttack(empty, 'lp', def)
    s = insertTokens(s, ['note:j.'], def)
    s = addAttack(s, 'hk', def)
    expect(s.tokens).toEqual(['lp', 'goes_into', 'note:j.', 'hk'])
  })
})

describe('practice', () => {
  it("keeps Tekken's button-combo icons as one step and skips notes, neutral and releases", () => {
    const steps = stepsFor(['right', 'neutral', 'down', 'downright', 'plus', 'qcf', 'note:CH', 'r_lp'], false, tekken)
    expect(steps.map((s) => s.token)).toEqual(['right', 'down', 'downright', 'qcf'])
    expect(stepsFor(['qcf', 'plus', 'hp'], false, def).map((s) => s.token)).toEqual(['down', 'downright', 'right', 'hp'])
  })
})

describe('share codes', () => {
  it('keeps old codes readable and round-trips the new tokens', () => {
    const tokens = ['neutral', 'r_hp', 'note:CH', 'c_down', 'h_lp', 'qcf']
    expect(decodeShare(encodeShare([{ name: 'x', tokens }])).combos[0].tokens).toEqual(tokens)
    // A code made before neutral/releases existed: "qcf + hp".
    const old = encodeShare([{ name: 'old', tokens: ['qcf', 'plus', 'hp'] }])
    expect(old).toBe('CT1:eyJjIjpbWyJvbGQiLCIxODAwMDUiLDBdXX0')
  })
})

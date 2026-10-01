import { describe, expect, it } from 'vitest'
import { parseComboFile, toComboFile } from './combos'
import {
  addAttack, addDirection, applyCommand, applyMotion, backspace, insertTokens,
  moveCursor, mutateLast, togglePlus, type EditState,
} from './editor'
import { BUILTIN_GLYPHS, resolveIcon } from './glyphs'
import { InputInterpreter, INPUT_PROFILES, resolveChord, type Frame, type PadButton } from './input'
import { applyNotation } from './notation'
import { compileTheme } from './theme'

const def = BUILTIN_GLYPHS.find((g) => g.name === 'Default')!
const tekken = BUILTIN_GLYPHS.find((g) => g.name === 'Tekken')!
const empty: EditState = { tokens: [], cursor: null }
const seq = (...fns: ((s: EditState) => EditState)[]) => fns.reduce((s, f) => f(s), empty)

describe('editor rules', () => {
  it('joins direction then attack with plus, and chains attacks with goes_into', () => {
    const s = seq(
      (s) => addDirection(s, 'down', def),
      (s) => addAttack(s, 'mk', def),
      (s) => addAttack(s, 'hp', def),
    )
    expect(s.tokens).toEqual(['down', 'plus', 'mk', 'goes_into', 'hp'])
  })

  it('puts goes_into between an attack and a following direction', () => {
    const s = seq((s) => addAttack(s, 'lp', def), (s) => addDirection(s, 'right', def))
    expect(s.tokens).toEqual(['lp', 'goes_into', 'right'])
  })

  it('chains up to three Any P presses without separators', () => {
    let s = empty
    for (let i = 0; i < 4; i++) s = addAttack(s, 'any_p', def)
    expect(s.tokens).toEqual(['any_p', 'any_p', 'any_p', 'goes_into', 'any_p'])
  })

  it('plus toggles an existing separator', () => {
    const s = seq((s) => addAttack(s, 'lp', def), (s) => addAttack(s, 'mp', def))
    const pos: EditState = { tokens: s.tokens, cursor: 2 }
    expect(togglePlus(pos).tokens).toEqual(['lp', 'plus', 'mp'])
  })

  it('inserts at the caret and moves it', () => {
    const s: EditState = { tokens: ['down', 'plus', 'hp'], cursor: 0 }
    const out = addAttack(s, 'lp', def)
    expect(out.tokens).toEqual(['lp', 'down', 'plus', 'hp'])
    expect(out.cursor).toBe(1)
    expect(moveCursor(out, 10).cursor).toBe(4)
    expect(backspace(out)).toEqual({ tokens: ['down', 'plus', 'hp'], cursor: 0 })
  })

  it('expands motion shortcuts with context separators', () => {
    const s = applyMotion({ tokens: ['hp'], cursor: null }, 'qcf', def)
    expect(s.tokens).toEqual(['hp', 'goes_into', 'down', 'downright', 'right'])
  })

  it('runs macro command strings (PDR)', () => {
    const s = applyCommand(empty, 'mp+mk+right right', def)
    expect(s.tokens).toEqual(['mp', 'plus', 'mk', 'plus', 'right', 'right'])
  })

  it('treats motion icons as buttons in Tekken packs', () => {
    const s = insertTokens({ tokens: ['lp'], cursor: null }, ['qcf'], tekken)
    expect(s.tokens).toEqual(['lp', 'goes_into', 'qcf'])
  })

  it('upgrades the last matching token for charge/hold', () => {
    expect(mutateLast({ tokens: ['down', 'plus', 'down'], cursor: null }, 'down', 'c_down').tokens)
      .toEqual(['down', 'plus', 'c_down'])
  })
})

describe('notation', () => {
  const macros = def.macros
  const parse = (text: string, start: EditState = empty) => applyNotation(start, text, def, macros)

  it('parses numpad notation with motions', () => {
    expect(parse('2MK > 236HP').state.tokens).toEqual(['down', 'plus', 'mk', 'goes_into', 'qcf', 'plus', 'hp'])
  })

  it('handles charge, jump, any-button and holds', () => {
    expect(parse('[4]6HP').state.tokens).toEqual(['c_left', 'right', 'plus', 'hp'])
    expect(parse('j.HK').state.tokens).toEqual(['note:j.', 'hk'])
    expect(parse('623P').state.tokens).toEqual(['dp', 'plus', 'any_p'])
    expect(parse('[HP]').state.tokens).toEqual(['h_hp'])
  })

  it('accepts words, xx and commas as separators', () => {
    expect(parse('qcf+lp xx 5HK, down+mk').state.tokens).toEqual([
      'qcf', 'plus', 'lp', 'goes_into', 'hk', 'goes_into', 'down', 'plus', 'mk',
    ])
  })

  it('expands macro names and reports unknown input', () => {
    const r = parse('5HP > DRC > wat')
    expect(r.state.tokens).toEqual(['hp', 'goes_into', 'mp', 'plus', 'mk'])
    expect(r.unknown).toEqual(['wat'])
  })

  it('joins onto the existing combo using context rules', () => {
    expect(parse('HP', { tokens: ['down'], cursor: null }).state.tokens).toEqual(['down', 'plus', 'hp'])
  })
})

describe('icon resolution', () => {
  const available = new Set(['lp', 'lp_ps', 'down_xb', 'down', 'qcf_tk', 'qcf_tk_2'])
  const ps = BUILTIN_GLYPHS.find((g) => g.name === 'PlayStation')!
  it('prefers the pack suffix, then swaps PS/Xbox, then the plain icon', () => {
    expect(resolveIcon('LP', ps, available)).toBe('lp_ps')
    expect(resolveIcon('down', ps, available)).toBe('down_xb')
    expect(resolveIcon('lp', def, available)).toBe('lp')
  })
  it('uses macro art in Tekken packs and falls back for hold/charge', () => {
    expect(resolveIcon('qcf', tekken, available, { macroArt: true })).toBe('qcf_tk_2')
    expect(resolveIcon('h_lp', ps, available)).toBe('lp_ps')
    expect(resolveIcon('nope', def, available)).toBeNull()
  })
})

describe('controller input', () => {
  it('resolves Tekken chords', () => {
    expect(resolveChord(new Set(['lp', 'mp']), INPUT_PROFILES.Tekken)).toEqual(['hp'])
    expect(resolveChord(new Set(['mp', 'mk', 'lp']), INPUT_PROFILES.Tekken)).toEqual(['rdp'])
    // Motion chords win first (lk+mk+mp → hcf), leftovers become attacks.
    expect(resolveChord(new Set(['lp', 'lk', 'mp', 'mk']), INPUT_PROFILES.Tekken))
      .toEqual(['hcf', 'plus', 'lp'])
  })

  it('groups near-simultaneous presses into one input', () => {
    const it = new InputInterpreter()
    const f = (time: number, ...buttons: PadButton[]): Frame => ({ time, dir: null, buttons: new Set(buttons) })
    expect(it.update(f(0, 'X'))).toEqual([])
    expect(it.update(f(30, 'X', 'Y'))).toEqual([])
    expect(it.update(f(90, 'X', 'Y'))).toEqual([{ type: 'insert', tokens: ['lp', 'plus', 'mp'] }])
  })

  it('records directions after they settle and upgrades to charge on hold', () => {
    const it = new InputInterpreter()
    const f = (time: number, dir: Frame['dir']): Frame => ({ time, dir, buttons: new Set() })
    expect(it.update(f(0, 'down'))).toEqual([])
    expect(it.update(f(16, 'down'))).toEqual([{ type: 'insert', tokens: ['down'] }])
    expect(it.update(f(400, 'down'))).toEqual([])
    expect(it.update(f(760, 'down'))).toEqual([{ type: 'mutate', from: 'down', to: 'c_down' }])
  })

  it('turns a long button hold into a hold input', () => {
    const it = new InputInterpreter()
    const f = (time: number, ...buttons: PadButton[]): Frame => ({ time, dir: null, buttons: new Set(buttons) })
    it.update(f(0, 'RB'))
    expect(it.update(f(100, 'RB'))).toEqual([{ type: 'insert', tokens: ['hp'] }])
    expect(it.update(f(800, 'RB'))).toEqual([{ type: 'mutate', from: 'hp', to: 'h_hp' }])
  })
})

describe('themes and files', () => {
  it('derives readable colours from a dark gradient', () => {
    const t = compileTheme('FFVII', {
      bg_grad: ['#0000AB', '#000080', '#000048', '#000020'], grad_combos: true,
    })
    expect(t.font).toBe('#FFFFFF')
    expect(t.gradCombos).toBe(true)
    expect(t.gradMain).toBe(false)
  })

  it('round-trips the desktop combo format including child rows', () => {
    const parsed = parseComboFile({
      glyph: 'Default', slot_count: 2,
      slots: [{ name: 'Starter', tokens: ['lp'] }, { name: '[>] Ender', tokens: ['hp'] }],
    })
    expect(parsed.combos[1]).toMatchObject({ name: 'Ender', child: true })
    expect(toComboFile(parsed.combos, 'Default').slots[1].name).toBe('[>] Ender')
  })

  it('reads single-combo files and rejects junk', () => {
    expect(parseComboFile({ name: 'x', tokens: ['lp'] }).combos).toHaveLength(1)
    expect(() => parseComboFile({ foo: 1 })).toThrow(/not a combo list/)
  })
})

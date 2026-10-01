import { describe, expect, it } from 'vitest'
import { BUILTIN_GLYPHS, iconSource, packFromFile } from './glyphs'
import {
  InputInterpreter, INPUT_PROFILES, parsePadCombo, profileFromMappings, type Frame, type PadButton,
} from './input'
import { defaultElement, layoutBody, layoutPicture, layoutTrace, parseLayout } from './layouts'
import { feedPractice, startPractice, stepsFor } from './practice'
import { decodeShare, encodeShare } from './share'
import { compileTheme, upgradeTheme } from './theme'
import { filterMoves, parseMoveList } from './movelist'

const press = (it: InputInterpreter, t: number, ...b: PadButton[]) => it.update({ time: t, dir: null, buttons: new Set(b) })
const inserts = (evs: ReturnType<InputInterpreter['update']>) => evs.filter((e) => e.type === 'insert').map((e) => e.tokens)

describe('controller specials', () => {
  it('Soul Calibur: a quick second press is a slide input', () => {
    const it = new InputInterpreter(undefined, INPUT_PROFILES['Soul Calibur'])
    press(it, 0, 'X')
    expect(inserts(press(it, 90))).toEqual([['lp']])
    press(it, 150, 'X')
    expect(inserts(press(it, 240))).toEqual([['hp']])
  })

  it('SNK: a pretzel motion plus a button becomes the special', () => {
    const it = new InputInterpreter(undefined, INPUT_PROFILES.SNK)
    const dirs: Frame['dir'][] = ['downleft', 'right', 'downright', 'down', 'downleft', 'left', 'downright']
    let t = 0
    for (const d of dirs) {
      it.update({ time: t, dir: d, buttons: new Set() })
      it.update({ time: t + 20, dir: d, buttons: new Set() })
      t += 40
    }
    press(it, t, 'X')
    expect(inserts(press(it, t + 90)).at(-1)).toEqual(['any_k'])
  })

  it('custom mappings match bigger button combinations first', () => {
    const it = new InputInterpreter(undefined, profileFromMappings({ lp: 'X', hp: 'X+Y', mk: 'RIGHT_SHOULDER' }))
    press(it, 0, 'X', 'Y', 'RB')
    expect(inserts(press(it, 90, 'X', 'Y', 'RB'))).toEqual([['hp', 'plus', 'mk']])
    expect(parsePadCombo('left_shoulder + lt')).toEqual(['LB', 'LT'])
  })
})

describe('user glyph packs', () => {
  const icons = new Set(['lp', 'lp_ps', 'mp'])
  const url = (n: string) => `/icons/${n}.png`
  const pack = packFromFile({
    name: 'Mine',
    tokens: { lp: { pack: 'PlayStation' }, mp: { image: 'data:image/png;base64,AAA' } },
    macros: ['Drive Rush, mp+mk'],
  })
  it('borrows icons from built-in packs, uses uploads, and falls back to Default', () => {
    expect(iconSource('lp', pack, icons, url)).toBe('/icons/lp_ps.png')
    expect(iconSource('h_mp', pack, icons, url)).toBe('data:image/png;base64,AAA')
    expect(iconSource('hk', pack, icons, url)).toBeNull()
    expect(pack.macros).toEqual([{ name: 'Drive Rush', command: 'mp+mk' }])
  })
  it('prefers controller art in the input viewer', () => {
    const tk = BUILTIN_GLYPHS.find((g) => g.name === 'Tekken')!
    expect(iconSource('lp', tk, new Set(['lp_tk', 'lp_tk_gamepad']), url, { gamepad: true })).toBe('/icons/lp_tk_gamepad.png')
  })
})

describe('layouts', () => {
  it('maps pictures to line-art tracings, arcade layouts to a panel', () => {
    const traces = new Set(['xboxone', 'snes'])
    const pad = parseLayout({ name: 'Xbox One', bg_image: 'D:/Tools/ComboTracker (Source)/icons/XboxOne.png', elements: [] }, 'x')
    expect(layoutPicture(pad)).toBeNull()
    expect(layoutBody(pad, traces)).toBe('trace')
    expect(layoutTrace(pad, traces)).toBe('xboxone')
    expect(layoutTrace(parseLayout({ name: 'SNES', elements: [] }, 'x'), traces)).toBe('snes')
    expect(layoutBody(parseLayout({ name: 'Vewlix 8', elements: [defaultElement('joystick')] }, 'x'), traces)).toBe('arcade')
    expect(layoutBody(parseLayout({ name: 'Mine', bg_image: 'data:image/png;base64,AA', elements: [] }, 'x'), traces)).toBe('none')
  })
  it('creates sensible default elements', () => {
    expect(defaultElement('X')).toMatchObject({ type: 'glyph', token: 'lp' })
    expect(defaultElement('LEFT_THUMB').type).toBe('stick')
    expect(() => parseLayout({}, 'x')).toThrow(/elements/)
  })
})

describe('practice mode', () => {
  it('expands motions, ignores separators, forgives stray directions', () => {
    const steps = stepsFor(['down', 'plus', 'mk', 'goes_into', 'qcf', 'plus', 'hp'])
    expect(steps.map((s) => s.token)).toEqual(['down', 'mk', 'down', 'downright', 'right', 'hp'])
    let p = startPractice(steps)
    for (const [t, i] of [['down', 0], ['mk', 1], ['left', 2], ['down', 3], ['downright', 4], ['right', 5]] as const) {
      p = feedPractice(p, t, i * 16)
    }
    expect(p.index).toBe(5)
    p = feedPractice(p, 'hp', 100)
    expect(p.completions).toBe(1)
    expect(p.index).toBe(0)
  })
  it('a wrong button is a drop; mirrored when facing left', () => {
    let p = startPractice(stepsFor(['down', 'plus', 'lp']))
    p = feedPractice(feedPractice(p, 'down', 0), 'hp', 10)
    expect(p.mistake).toMatchObject({ expected: 'lp', got: 'hp' })
    expect(stepsFor(['downright', 'plus', 'lp'], true)[0].token).toBe('downleft')
  })
})

describe('share codes and themes', () => {
  it('round-trips combos, including unknown tokens', () => {
    const code = encodeShare([{ name: 'BnB ✨', tokens: ['down', 'plus', 'mk', 'goes_into', 'weird'], child: true }], 'Default')
    expect(code.startsWith('CT1:')).toBe(true)
    expect(decodeShare(`look: ${code} thanks`)).toEqual({
      glyph: 'Default', combos: [{ name: 'BnB ✨', tokens: ['down', 'plus', 'mk', 'goes_into', 'weird'], child: true }],
    })
    expect(() => decodeShare('hello')).toThrow(/share code/)
  })
  it('keeps the source file and upgrades old saved themes', () => {
    const t = compileTheme('X', { bg: '#101010', palette_style: 'Modern', grad_standard_btns: true })
    expect(t.paletteStyle).toBe('Modern')
    expect(t.gradStandard).toBe(false) // no gradient colours, so no gradient
    const old = upgradeTheme({ name: 'Old', bg: '#000000', font: '#ffffff', highlight: '#333333', entryBg: '#111111', btnBg: '#111111', gradient: null } as never)
    expect(old.source.bg).toBe('#000000')
  })
})

describe('move lists', () => {
  it('reads sectioned lists and older hand-made ones', () => {
    const fresh = parseMoveList({ slots: [
      { name: 'Hadoken', tokens: ['qcf', 'plus', 'any_p'], section: 'Special moves', notes: 'OD: 236PP' },
      { name: 'Shinku Hadoken', tokens: ['qcf', 'qcf', 'plus', 'any_p'], section: 'Super Arts', notes: '' },
    ] })
    expect(fresh.sections.map((s) => s.title)).toEqual(['Special moves', 'Super Arts'])
    const old = parseMoveList({ slots: [
      { name: 'Fuumajin', tokens: ['lp'] },
      { name: '[>] Cut projectile\n(1 Magatama)', tokens: [] },
    ] })
    expect(old.sections[0].title).toBe('Moves')
    expect(old.sections[0].moves[1]).toMatchObject({ name: 'Cut projectile', followUp: true, notes: '1 Magatama' })
    expect(filterMoves(fresh, 'od')[0].moves[0].name).toBe('Hadoken')
  })
})

describe('practice stats', () => {
  it('tracks rate, streaks and days', async () => {
    const { recordAttempt, rate, recentDays, statsKey } = await import('./stats')
    const day = new Date(2026, 0, 10, 12).getTime()
    let s = recordAttempt(undefined, true, day)
    s = recordAttempt(s, true, day)
    s = recordAttempt(s, false, day)
    s = recordAttempt(s, true, day + 86_400_000)
    expect(s).toMatchObject({ tries: 4, clean: 3, streak: 1, best: 2 })
    expect(rate(s)).toBe(75)
    const recent = recentDays(s, 3, day + 86_400_000)
    expect(recent.map((d) => [d.tries, d.clean])).toEqual([[0, 0], [3, 2], [1, 1]])
    expect(statsKey(['2', 'mk', 'newline', '236', 'hp'])).toBe('2 mk 236 hp')
  })

  it('counts drops only after the combo started', async () => {
    const { feedPractice, startPractice, stepsFor } = await import('./practice')
    let s = startPractice(stepsFor(['lp', 'mp', 'hp']))
    s = feedPractice(s, 'hk', 0)
    expect(s.drops).toBe(0)
    s = feedPractice(s, 'lp', 1)
    s = feedPractice(s, 'hk', 2)
    expect(s.drops).toBe(1)
  })
})

describe('controller detection', () => {
  it('recognises common pads from their gamepad id', async () => {
    const { padFamily } = await import('./controllers')
    expect(padFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox')
    expect(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation')
    expect(padFamily('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation')
    expect(padFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo')
    expect(padFamily('Snack Box Micro (Vendor: 2e8a Product: 10c8)')).toBe('leverless')
    expect(padFamily('Qanba Obsidian 2 Arcade Joystick (Vendor: 2c22 Product: 2503)')).toBe('stick')
    expect(padFamily('USB Gamepad (Vendor: 0079 Product: 0006)')).toBe('generic')
  })
})

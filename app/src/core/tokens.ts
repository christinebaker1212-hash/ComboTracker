// Token vocabulary shared by every part of the app. A combo is an ordered list
// of these tokens; the same strings are used in saved JSON files, so they must
// stay compatible with the original desktop app.

export type Token = string

export const BASE_ATTACKS = [
  'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3',
] as const
export const HOLD_ATTACKS = BASE_ATTACKS.map((a) => `h_${a}`)
export const ATTACKS = new Set<string>([...BASE_ATTACKS, ...HOLD_ATTACKS])

export const CARDINALS = [
  'up', 'down', 'left', 'right', 'upright', 'upleft', 'downright', 'downleft',
] as const
export type Direction = (typeof CARDINALS)[number]
export const CHARGE_DIRS = CARDINALS.map((d) => `c_${d}`)
export const MOTIONS = ['qcb', 'qcf', 'hcb', 'hcf', '360', 'dp', 'rdp'] as const
export const DIRECTIONS = new Set<string>([...CARDINALS, ...CHARGE_DIRS, ...MOTIONS])

export const SYMBOLS = new Set(['plus', 'newline', 'goes_into'])

export const TEXT_MAP: Record<string, string> = {
  lp: 'LP', mp: 'MP', hp: 'HP', lk: 'LK', mk: 'MK', hk: 'HK',
  any_p: 'Any P', any_k: 'Any K', start: 'START', select: 'SELECT', l3: 'L3', r3: 'R3',
  up: '↑', down: '↓', left: '←', right: '→',
  upright: '↗', upleft: '↖', downright: '↘', downleft: '↙',
  c_up: '[C]↑', c_down: '[C]↓', c_left: '[C]←', c_right: '[C]→',
  c_upright: '[C]↗', c_upleft: '[C]↖', c_downright: '[C]↘', c_downleft: '[C]↙',
  h_lp: '[H]LP', h_mp: '[H]MP', h_hp: '[H]HP', h_lk: '[H]LK', h_mk: '[H]MK', h_hk: '[H]HK',
  h_any_p: '[H]Any P', h_any_k: '[H]Any K',
  goes_into: '➔', plus: '+', newline: '↵',
  qcb: 'QCB', qcf: 'QCF', hcb: 'HCB', hcf: 'HCF', '360': '360', dp: 'DP', rdp: 'RDP',
}

export const tokenLabel = (t: Token) => TEXT_MAP[t] ?? t.toUpperCase()

/** Multi-token expansions for the motion shortcut buttons (the "print entire input" macros). */
export const MOTION_EXPANSIONS: Record<string, Token[]> = {
  qcf: ['down', 'downright', 'right'],
  qcb: ['down', 'downleft', 'left'],
  dp: ['right', 'down', 'downright'],
  rdp: ['left', 'down', 'downleft'],
  hcf: ['left', 'downleft', 'down', 'downright', 'right'],
  hcb: ['right', 'downright', 'down', 'downleft', 'left'],
}

export const MACRO_TOOLTIPS: Record<string, string> = {
  PDR: 'Parry Drive Rush', DRC: 'Drive Rush Cancel', QCB: 'Quarter circle back (214)',
  QCF: 'Quarter circle forward (236)', HCB: 'Half circle back (63214)',
  HCF: 'Half circle forward (41236)', RDP: 'Reverse dragon punch (421)',
  FDP: 'Forward dragon punch (623)', DP: 'Dragon punch (623)',
  EWGF: 'Electric Wind God Fist', RA: 'Rage Art',
}

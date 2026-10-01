// Token vocabulary shared by every part of the app. A combo is an ordered list
// of these tokens; the same strings are used in saved JSON files, so they must
// stay compatible with the original desktop app.

export type Token = string

export const BASE_ATTACKS = [
  'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'any_p', 'any_k', 'start', 'select', 'l3', 'r3',
] as const
export const HOLD_ATTACKS = BASE_ATTACKS.map((a) => `h_${a}`)
/** Button releases ("negative edge"), e.g. ]HP[ for moves done by letting go of a held button. */
export const RELEASE_ATTACKS = BASE_ATTACKS.slice(0, 8).map((a) => `r_${a}`)
export const ATTACKS = new Set<string>([...BASE_ATTACKS, ...HOLD_ATTACKS, ...RELEASE_ATTACKS])

export const CARDINALS = [
  'up', 'down', 'left', 'right', 'upright', 'upleft', 'downright', 'downleft',
] as const
export type Direction = (typeof CARDINALS)[number]
export const CHARGE_DIRS = CARDINALS.map((d) => `c_${d}`)
export const MOTIONS = ['qcb', 'qcf', 'hcb', 'hcf', '360', 'dp', 'rdp'] as const
/** The stick returning to the middle (numpad 5, Tekken's ★ / "n"), as in f,n,d,df+2. */
export const NEUTRAL = 'neutral'
export const DIRECTIONS = new Set<string>([...CARDINALS, ...CHARGE_DIRS, ...MOTIONS, NEUTRAL])

export const SYMBOLS = new Set(['plus', 'newline', 'goes_into'])

/**
 * Context notes written into a combo as text, such as "j." (jumping), "CH"
 * (counter hit) or "dl." (delay). Stored as "note:<text>"; any text works.
 */
export const NOTE_PREFIX = 'note:'
export const isNote = (t: Token) => t.startsWith(NOTE_PREFIX)
export const note = (text: string): Token => `${NOTE_PREFIX}${text.replace(/~/g, '').trim()}`

/** The notes offered in the palette, with what each one means. */
export const QUICK_NOTES: [string, string][] = [
  ['j.', 'Jumping: the next attack is done in the air'],
  ['sj.', 'Super jump'],
  ['jc', 'Jump cancel'],
  ['dl.', 'Delay: wait a moment before the next input'],
  ['CH', 'Counter hit'],
  ['PC', 'Punish counter'],
  ['dash', 'Dash'],
  ['walk', 'Walk forward (microwalk)'],
  ['whiff', 'Let the attack miss'],
  ['land', 'Land before the next input'],
]

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
  neutral: 'N',
}

export function tokenLabel(t: Token): string {
  if (TEXT_MAP[t]) return TEXT_MAP[t]
  if (isNote(t)) return t.slice(NOTE_PREFIX.length)
  if (t.startsWith('r_')) return `]${tokenLabel(t.slice(2))}[`
  return t.toUpperCase()
}

/** Multi-token expansions for the motion shortcut buttons (the "print entire input" macros). */
export const MOTION_EXPANSIONS: Record<string, Token[]> = {
  qcf: ['down', 'downright', 'right'],
  qcb: ['down', 'downleft', 'left'],
  dp: ['right', 'down', 'downright'],
  rdp: ['left', 'down', 'downleft'],
  hcf: ['left', 'downleft', 'down', 'downright', 'right'],
  hcb: ['right', 'downright', 'down', 'downleft', 'left'],
  qcf2: ['down', 'downright', 'right', 'down', 'downright', 'right'],
  qcb2: ['down', 'downleft', 'left', 'down', 'downleft', 'left'],
}

export const MACRO_TOOLTIPS: Record<string, string> = {
  PDR: 'Parry Drive Rush', DRC: 'Drive Rush Cancel', QCB: 'Quarter circle back (214)',
  QCF: 'Quarter circle forward (236)', HCB: 'Half circle back (63214)',
  HCF: 'Half circle forward (41236)', RDP: 'Reverse dragon punch (421)',
  FDP: 'Forward dragon punch (623)', DP: 'Dragon punch (623)',
  'QCF×2': 'Double quarter circle forward (236236), the usual super input',
  'QCB×2': 'Double quarter circle back (214214)',
  DI: 'Drive Impact (HP+HK)', THROW: 'Throw (LP+LK)',
  EWGF: 'Electric Wind God Fist (f,n,d,d/f+2)', RA: 'Rage Art (d/f+1+2)', HB: 'Heat Burst (2+3)',
}

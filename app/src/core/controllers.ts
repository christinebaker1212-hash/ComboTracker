// Works out what kind of controller is plugged in from the browser's gamepad
// id, so the app can suggest matching button icons and an input viewer layout.

export type PadFamily = 'xbox' | 'playstation' | 'nintendo' | 'stick' | 'leverless' | 'keyboard' | 'generic'

export interface FamilyInfo {
  label: string
  /** Built-in icon style to suggest. */
  glyph: string
  /** Input viewer layout to suggest. */
  layout: string
}

export const FAMILIES: Record<Exclude<PadFamily, 'generic'>, FamilyInfo> = {
  xbox: { label: 'Xbox controller', glyph: 'Xbox', layout: 'builtin:Gamepad/Xbox One.json' },
  playstation: { label: 'PlayStation controller', glyph: 'PlayStation', layout: 'builtin:Gamepad/PlayStation 1.json' },
  nintendo: { label: 'Nintendo controller', glyph: 'Nintendo', layout: 'builtin:Gamepad/WiiU Pro Controller.json' },
  stick: { label: 'Arcade stick', glyph: 'Default', layout: 'builtin:Arcade/Vewlix/Vewlix 8.json' },
  leverless: { label: 'Leverless (all-button)', glyph: 'Default', layout: 'builtin:Leverless.json' },
  keyboard: { label: 'Keyboard', glyph: 'PC', layout: 'builtin:Leverless.json' },
}

/** Icon styles that just describe a controller; anything else is a deliberate game style. */
export const PAD_GLYPHS = new Set(['Default', 'Xbox', 'PlayStation', 'Nintendo', 'PC'])

const RULES: [PadFamily, RegExp][] = [
  ['leverless', /hit ?box|snack ?box|leverless|mixbox|cross ?up|haute|b0xx|frame1|smash ?box/i],
  ['stick', /arcade|fight ?stick|fightstick|\bstick\b|qanba|panthera|victrix|\bobsidian|\bdrone\b|vendor: 2c22|2c22-/i],
  ['playstation', /dualsense|dualshock|playstation|\bps[345]\b|054c|wireless controller/i],
  ['nintendo', /nintendo|pro controller|joy-?con|switch|057e/i],
  ['xbox', /xbox|xinput|045e|x-?box/i],
]

export function padFamily(id: string): PadFamily {
  return RULES.find(([, re]) => re.test(id))?.[0] ?? 'generic'
}

// Theme files are the same JSON the desktop app uses. A theme either sets flat
// colours (bg, font, highlight, entry_bg, btn_bg) or a 4-corner gradient
// (bg_grad) from which the flat colours are derived automatically.

export interface ThemeFile {
  bg?: string
  font?: string
  highlight?: string
  entry_bg?: string
  btn_bg?: string
  bg_grad?: [string, string, string, string]
  ui_bg_mode?: 'Auto' | 'Custom'
  palette_style?: 'Classic' | 'Flat' | string
  grad_main_bg?: boolean
  grad_btns_and_highlights?: boolean
  grad_standard_btns?: boolean
  grad_combos?: boolean
  grad_pinned?: boolean
}

export interface Theme {
  name: string
  bg: string
  font: string
  highlight: string
  entryBg: string
  btnBg: string
  gradient: [string, string, string, string] | null
  gradMain: boolean
  /** Gradient on palette keys and highlights. */
  gradButtons: boolean
  /** Gradient on ordinary buttons (toolbar, dialogs). */
  gradStandard: boolean
  gradCombos: boolean
  gradPinned: boolean
  /** "Classic" gives palette keys a raised, bevelled look; "Modern" is flat. */
  paletteStyle: 'Classic' | 'Modern'
  /** The file this theme came from, so the theme editor can reopen it. */
  source: ThemeFile
}

const hexToRgb = (h: string): [number, number, number] => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0) as [number, number, number]
}
const rgbToHex = (rgb: number[]) =>
  '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')

export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** WCAG contrast ratio (1–21). 4.5+ is comfortable for normal text. */
export function contrastRatio(a: string, b: string): number {
  const rel = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [rel(a), rel(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Shifts a colour away from its own brightness: darker for light colours, lighter for dark ones. */
export function contrastShift(hex: string, amount: number) {
  const rgb = hexToRgb(hex)
  const light = luminance(hex) > 0.5
  return rgbToHex(rgb.map((c) => (light ? c - amount : c + amount)))
}

export function lighten(hex: string, amount: number) {
  return rgbToHex(hexToRgb(hex).map((c) => c + amount))
}

export function compileTheme(name: string, data: ThemeFile): Theme {
  let bg = data.bg ?? '#0F0F0F'
  let font = data.font ?? '#FFFFFF'
  let highlight = data.highlight ?? '#505050'
  let entryBg = data.entry_bg ?? '#1E1F20'
  let btnBg = data.btn_bg ?? entryBg
  const gradient = data.bg_grad?.length === 4 ? data.bg_grad : null

  if (gradient) {
    const avg = gradient.map(hexToRgb).reduce<number[]>((a, c) => a.map((v, i) => v + c[i] / 4), [0, 0, 0])
    const avgHex = rgbToHex(avg)
    const light = luminance(avgHex) > 0.5
    const auto = {
      font: light ? '#000000' : '#FFFFFF',
      bg: contrastShift(avgHex, 15),
      entry: contrastShift(avgHex, 30),
      hl: contrastShift(avgHex, 60),
    }
    if (data.ui_bg_mode === 'Custom') {
      bg = data.bg ?? auto.bg
      entryBg = data.entry_bg ?? auto.entry
      btnBg = data.btn_bg ?? entryBg
      highlight = data.highlight ?? auto.hl
      font = data.font ?? auto.font
    } else {
      bg = auto.bg
      entryBg = auto.entry
      btnBg = auto.entry
      highlight = auto.hl
      font = auto.font
    }
  }

  return {
    name,
    bg,
    font,
    highlight,
    entryBg,
    btnBg,
    gradient,
    gradMain: !!(gradient && data.grad_main_bg),
    gradButtons: !!(gradient && data.grad_btns_and_highlights),
    gradStandard: !!(gradient && data.grad_standard_btns),
    gradCombos: !!(gradient && data.grad_combos),
    gradPinned: !!(gradient && data.grad_pinned),
    paletteStyle: data.palette_style === 'Modern' ? 'Modern' : 'Classic',
    source: data,
  }
}

export const DEFAULT_THEME = compileTheme('Dark', {
  bg: '#0F0F0F', font: '#FFFFFF', highlight: '#505050', entry_bg: '#1E1F20', palette_style: 'Modern',
})

/** Themes saved by older versions of this app lack newer fields; fill them in. */
export function upgradeTheme(t: Partial<Theme> | undefined): Theme {
  if (!t || !t.bg) return DEFAULT_THEME
  if (t.source && t.paletteStyle) return t as Theme
  return compileTheme(t.name ?? 'Theme', t.source ?? { bg: t.bg, font: t.font, highlight: t.highlight, entry_bg: t.entryBg, btn_bg: t.btnBg, bg_grad: t.gradient ?? undefined })
}

/** CSS custom properties for a theme. The stylesheet builds every surface from these. */
export function themeToCss(t: Theme): Record<string, string> {
  const g = t.gradient ?? [t.bg, t.bg, t.bg, t.bg]
  return {
    '--bg': t.bg,
    '--fg': t.font,
    '--hl': t.highlight,
    '--surface': t.entryBg,
    '--btn': t.btnBg,
    '--btn-hover': lighten(t.btnBg, luminance(t.btnBg) > 0.5 ? -20 : 24),
    '--muted': `color-mix(in srgb, ${t.font} 60%, transparent)`,
    '--border': `color-mix(in srgb, ${t.font} 14%, transparent)`,
    '--g0': g[0], '--g1': g[1], '--g2': g[2], '--g3': g[3],
  }
}

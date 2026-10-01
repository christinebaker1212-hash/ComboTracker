import { iconUrl, useAssets } from '../assets'
import { iconSource, isAtk, labelFor, needsMarker, type GlyphPack } from '../core/glyphs'
import { isNote, type Token } from '../core/tokens'

interface Props {
  token: Token
  glyph: GlyphPack
  size?: number
  macroArt?: boolean
  gamepad?: boolean
}

/** One combo token: the glyph pack's icon if it has one, otherwise a text chip. */
export function TokenView({ token, glyph, size = 28, macroArt, gamepad }: Props) {
  const { icons } = useAssets()
  const src = iconSource(token, glyph, icons, iconUrl, { macroArt, gamepad })
  const label = labelFor(token, glyph)
  if (src) {
    // Hold/charge/release drawn with the plain icon: mark it (held underline, release arrow).
    const marker = needsMarker(token, glyph, icons) ? (token.startsWith('r_') ? ' tok-release' : ' tok-hold') : ''
    return (
      <span className={`tok tok-icon${marker}`} style={{ height: size }} title={label}>
        <img src={src} alt={label} height={size} draggable={false} />
      </span>
    )
  }
  const kind = isNote(token) ? 'note' : token === 'plus' || token === 'goes_into' ? 'sep' : isAtk(token, glyph) ? 'atk' : 'dir'
  return (
    <span className={`tok tok-text tok-${kind}`} style={{ height: size, fontSize: size * 0.42 }} title={label}>
      {label}
    </span>
  )
}

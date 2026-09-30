import { iconUrl, useAssets } from '../assets'
import { isAtk, resolveIcon, type GlyphPack } from '../core/glyphs'
import { tokenLabel, type Token } from '../core/tokens'

interface Props {
  token: Token
  glyph: GlyphPack
  size?: number
  macroArt?: boolean
}

/** One combo token: the glyph pack's icon if it has one, otherwise a text chip. */
export function TokenView({ token, glyph, size = 28, macroArt }: Props) {
  const { icons } = useAssets()
  const icon = resolveIcon(token, glyph, icons, { macroArt })
  const hold = token.startsWith('h_') || token.startsWith('c_')
  if (icon) {
    return (
      <span className={`tok tok-icon${hold ? ' tok-hold' : ''}`} style={{ height: size }} title={tokenLabel(token)}>
        <img src={iconUrl(icon)} alt={tokenLabel(token)} height={size} draggable={false} />
      </span>
    )
  }
  const kind = token === 'plus' || token === 'goes_into' ? 'sep' : isAtk(token, glyph) ? 'atk' : 'dir'
  return (
    <span className={`tok tok-text tok-${kind}`} style={{ height: size, fontSize: size * 0.42 }}>
      {tokenLabel(token)}
    </span>
  )
}

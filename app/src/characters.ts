// Characters as listed by the command-list presets: Game/Character.json.
import { presetName } from './assets'
import { splitRef } from './store/useLibrary'

export interface Entry { ref: string; game: string; character: string; mine: boolean }

export function entries(refs: string[]): Entry[] {
  return refs.map((ref) => {
    const { origin, path } = splitRef(ref)
    const parts = path.split('/')
    return { ref, game: parts.length > 1 ? parts[0] : 'Other', character: presetName(path), mine: origin === 'user' }
  })
}

export const initials = (name: string) => name.replace(/[^A-Za-z0-9 .]/g, '').split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

// Everything the user can pick from: built-in presets (shipped with the app)
// merged with the user's own saved items.
import { create } from 'zustand'
import { fetchPreset, loadManifest, presetName } from '../assets'
import { BUILTIN_GLYPHS, packFromFile, type GlyphPack, type GlyphPackFile } from '../core/glyphs'
import { parseLayout, type Layout } from '../core/layouts'
import { listUser, readUser, type UserKind } from '../userdata'

/** A preset reference: "builtin:Street Fighter 6/Ryu.json" or "user:My combos.json". */
export type PresetRef = `${'builtin' | 'user'}:${string}`
export const presetRef = (origin: 'builtin' | 'user', path: string) => `${origin}:${path}` as PresetRef
export const splitRef = (ref: string) => {
  const i = ref.indexOf(':')
  return { origin: ref.slice(0, i) as 'builtin' | 'user', path: ref.slice(i + 1) }
}

type PresetKind = 'combos' | 'commandLists' | 'themes' | 'layouts'

interface LibraryState {
  user: Record<UserKind, string[]>
  userGlyphs: GlyphPack[]
  ready: boolean
  refresh(kind?: UserKind): Promise<void>
}

const EMPTY_USER: Record<UserKind, string[]> = { combos: [], commandLists: [], themes: [], layouts: [], glyphs: [] }

export const useLibrary = create<LibraryState>()((set, get) => ({
  user: EMPTY_USER,
  userGlyphs: [],
  ready: false,
  refresh: async (kind) => {
    const kinds: UserKind[] = kind ? [kind] : ['combos', 'commandLists', 'themes', 'layouts', 'glyphs']
    const user = { ...get().user }
    for (const k of kinds) user[k] = await listUser(k)
    let userGlyphs = get().userGlyphs
    if (kinds.includes('glyphs')) {
      userGlyphs = []
      for (const path of user.glyphs) {
        try {
          userGlyphs.push(packFromFile((await readUser('glyphs', path)) as GlyphPackFile))
        } catch {
          // A broken pack file shouldn't stop the others loading.
        }
      }
    }
    set({ user, userGlyphs, ready: true })
  },
}))

export const allGlyphs = (user: GlyphPack[]) => [...BUILTIN_GLYPHS, ...user.filter((u) => !BUILTIN_GLYPHS.some((b) => b.name === u.name))]

/** Reads any preset, built-in or the user's own. */
export async function readPreset(kind: PresetKind, ref: string): Promise<unknown> {
  const { origin, path } = splitRef(ref)
  if (origin === 'user') return readUser(kind, path)
  if (kind === 'layouts') {
    const url = `${import.meta.env.BASE_URL}presets/Layouts/${path.split('/').map(encodeURIComponent).join('/')}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Couldn't load ${path}`)
    return r.json()
  }
  return fetchPreset(kind, path)
}

/** Built-in and user refs for a preset kind, user items first. */
export async function allRefs(kind: PresetKind): Promise<PresetRef[]> {
  const manifest = await loadManifest()
  const builtin = manifest.presets[kind].map((p) => presetRef('builtin', p))
  const user = useLibrary.getState().user[kind].map((p) => presetRef('user', p))
  return [...user, ...builtin]
}

export async function loadLayout(ref: string): Promise<Layout> {
  return parseLayout(await readPreset('layouts', ref), presetName(splitRef(ref).path))
}

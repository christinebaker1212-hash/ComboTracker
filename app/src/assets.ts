// Loads the manifest written by scripts/sync-assets.mjs and fetches presets.
import { createContext, useContext, useEffect, useState } from 'react'

export interface Manifest {
  icons: string[]
  presets: { combos: string[]; commandLists: string[]; themes: string[]; layouts: string[] }
}

const EMPTY: Manifest = { icons: [], presets: { combos: [], commandLists: [], themes: [], layouts: [] } }

const base = import.meta.env.BASE_URL

let manifestPromise: Promise<Manifest> | null = null
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(`${base}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : EMPTY))
    .catch(() => EMPTY)
  return manifestPromise
}

export function useManifest() {
  const [m, setM] = useState<{ manifest: Manifest; icons: Set<string> } | null>(null)
  useEffect(() => {
    loadManifest().then((manifest) => setM({ manifest, icons: new Set(manifest.icons) }))
  }, [])
  return m
}

export const iconUrl = (name: string) => `${base}icons/${name}.png`

export const PRESET_FOLDERS = {
  combos: 'Combos',
  commandLists: 'Command Lists',
  themes: 'Themes',
} as const

export async function fetchPreset(folder: keyof typeof PRESET_FOLDERS, path: string): Promise<unknown> {
  const url = `${base}presets/${encodeURIComponent(PRESET_FOLDERS[folder])}/${path.split('/').map(encodeURIComponent).join('/')}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Couldn't load ${path} (${r.status})`)
  return r.json()
}

export const presetName = (path: string) => path.split('/').pop()!.replace(/\.json$/i, '')

export const AssetsContext = createContext<{ manifest: Manifest; icons: Set<string> }>({
  manifest: { icons: [], presets: { combos: [], commandLists: [], themes: [], layouts: [] } },
  icons: new Set(),
})

export const useAssets = () => useContext(AssetsContext)

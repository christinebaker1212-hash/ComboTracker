// In-app updates. Every build on GitHub is stamped with its build number
// (the Actions run number) and published to the "latest" release together
// with the bare ComboTracker.exe. The app compares numbers and, when there's
// a newer one, the desktop side swaps the exe in place (src-tauri/src/update.rs).
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'

/** This build's number, or null for a build made on your own computer. */
export const BUILD: number | null = Number(import.meta.env.VITE_BUILD) || null
export const COMMIT: string | null = import.meta.env.VITE_COMMIT || null

const RELEASE_API = 'https://api.github.com/repos/christinebaker1212-hash/ComboTracker/releases/tags/latest'
export const RELEASE_PAGE = 'https://github.com/christinebaker1212-hash/ComboTracker/releases/tag/latest'

export interface UpdateInfo {
  build: number
  /** Direct download of the new ComboTracker.exe. */
  url: string
}

/** Reads the build number (from the title, "… (build 123)") and the exe's download link from a release. */
export function parseRelease(json: unknown): UpdateInfo | null {
  const r = json as { name?: string; assets?: { name?: string; browser_download_url?: string }[] }
  const build = Number(r?.name?.match(/build (\d+)/i)?.[1])
  const exe = r?.assets?.find((a) => a.name?.toLowerCase() === 'combotracker.exe')
  return build && exe?.browser_download_url ? { build, url: exe.browser_download_url } : null
}

/** A newer build than this one, if there is one. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktop || !BUILD) return null
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`Couldn't reach GitHub (${res.status})`)
  const info = parseRelease(await res.json())
  return info && info.build > BUILD ? info : null
}

/** Downloads the update and restarts into it. Resolves only if something went wrong (the app exits otherwise). */
export const installUpdate = (info: UpdateInfo) => invoke('update_install', { url: info.url })

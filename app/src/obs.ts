// Stream links: pages OBS loads from the desktop app's local server
// (src-tauri/src/obs.rs). They aren't Tauri windows, so they get the main
// window's state and the controller over the server instead.
import { packFromFile, type GlyphPack, type GlyphPackFile } from './core/glyphs'
import type { Layout } from './core/layouts'

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()

/** True on a page OBS opened from a stream link. */
export const isObs = params.has('obs')

/** Size and background asked for in the link: ?scale=1.5&bg=dark. */
export const obsScale = Number(params.get('scale')) || null
export const obsBackdrop = params.get('bg')

/** Extra data the main window sends along: things this page can't load itself. */
export interface ObsExtras {
  /** The input viewer layout in use (it may be one of the user's own files). */
  obsLayout?: Layout
  /** The icon style in use, when it's one the user made. */
  obsGlyph?: GlyphPackFile
}

let extras: ObsExtras = {}
// Kept as one object until the style changes, so hooks keyed on it don't restart.
let glyph: GlyphPack | null = null
let glyphJson = ''
export const obsLayout = (): Layout | null => extras.obsLayout ?? null
export const obsGlyph = (): GlyphPack | null => glyph

/**
 * Connects to the desktop app: saves its state where the floating windows
 * read it from and passes controller updates on. Reconnects by itself if the
 * app restarts.
 */
export function startObsBridge(storageKey: string, onPads: (json: string) => void) {
  const source = new EventSource('/api/events')
  source.addEventListener('state', (e) => {
    try {
      const data = JSON.parse((e as MessageEvent<string>).data) as ObsExtras & Record<string, unknown>
      extras = { obsLayout: data.obsLayout, obsGlyph: data.obsGlyph }
      const json = JSON.stringify(data.obsGlyph ?? null)
      if (json !== glyphJson) {
        glyphJson = json
        glyph = data.obsGlyph ? packFromFile(data.obsGlyph) : null
      }
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch {
      return
    }
    window.dispatchEvent(new Event('ct-state'))
  })
  source.addEventListener('pads', (e) => onPads((e as MessageEvent<string>).data))
}

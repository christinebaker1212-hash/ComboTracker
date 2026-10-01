// Main window: runs the stream link server when it's turned on and keeps it
// fed with the current state, so OBS pages show the same combos, theme,
// icons and controller layout as the app.
import { invoke } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import { create } from 'zustand'
import { packToFile } from '../core/glyphs'
import type { Layout } from '../core/layouts'
import { isDesktop } from '../platform'
import { loadLayout } from '../store/useLibrary'
import { useStore } from '../store/useStore'

export const DEFAULT_OBS = { enabled: false, port: 7777 }

/** The port the server is listening on, or null when it's off. */
export const useObsStatus = create<{ port: number | null; error: string | null }>()(() => ({ port: null, error: null }))

const layoutCache = new Map<string, Promise<Layout | null>>()
const layoutFor = (ref: string | null) => {
  if (!ref) return Promise.resolve(null)
  if (!layoutCache.has(ref)) layoutCache.set(ref, loadLayout(ref).catch(() => null))
  return layoutCache.get(ref)!
}

async function push() {
  const s = useStore.getState()
  const state = {
    lists: s.lists, glyph: s.glyph.name, theme: s.theme, themePath: s.themePath, pinScale: s.pinScale, settings: s.settings,
    obsLayout: await layoutFor(s.settings.viewerLayout),
    obsGlyph: s.glyph.source === 'user' ? packToFile(s.glyph) : undefined,
  }
  await invoke('obs_state', { state: JSON.stringify(state) })
}

/** Whether this window started the server, so turning the setting off only stops what it started. */
let started = false

export function useObsHost() {
  const obs = useStore((s) => s.settings.obs ?? DEFAULT_OBS)
  useEffect(() => {
    if (!isDesktop) return
    if (!obs.enabled && started) void invoke('obs_stop').catch(() => {})
    started = obs.enabled
    useObsStatus.setState({ port: null, error: null })
    let stopped = false
    // Off in Settings: still feed a server started at launch (COMBOTRACKER_STREAM_PORT).
    const running = obs.enabled ? invoke<number>('obs_start', { port: obs.port }) : invoke<number | null>('obs_port')
    running
      .then((port) => {
        if (stopped || !port) return
        useObsStatus.setState({ port, error: null })
        void push()
      })
      .catch((e) => useObsStatus.setState({ port: null, error: String(e) }))
    let timer: ReturnType<typeof setTimeout> | undefined
    const un = useStore.subscribe((s, prev) => {
      if (s.lists === prev.lists && s.glyph === prev.glyph && s.theme === prev.theme && s.settings === prev.settings) return
      clearTimeout(timer)
      timer = setTimeout(() => void push().catch(() => {}), 120)
    })
    return () => {
      stopped = true
      clearTimeout(timer)
      un()
    }
  }, [obs.enabled, obs.port])
}

import { useEffect } from 'react'
import { HOTKEYS, hotkeyLabel } from '../hotkeys'
import { isDesktop } from '../platform'
import { useStore } from '../store/useStore'

/** Registers the global hotkeys while enabled; reports any another app already owns. */
export function useGlobalHotkeys(enabled: boolean) {
  useEffect(() => {
    if (!isDesktop || !enabled) return
    let cancelled = false
    const registered: string[] = []
    void (async () => {
      const gs = await import('@tauri-apps/plugin-global-shortcut')
      const taken: string[] = []
      for (const h of HOTKEYS) {
        if (cancelled) return
        try {
          await gs.register(h.keys, (e) => e.state === 'Pressed' && h.run())
          if (cancelled) {
            await gs.unregister(h.keys)
            return
          }
          registered.push(h.keys)
        } catch {
          taken.push(hotkeyLabel(h.keys))
        }
      }
      if (taken.length && !cancelled) {
        useStore.getState().notify(`Another app already uses ${taken.join(', ')}, so ${taken.length === 1 ? 'that hotkey is' : 'those hotkeys are'} off.`, 'error')
      }
    })()
    return () => {
      cancelled = true
      if (registered.length) void import('@tauri-apps/plugin-global-shortcut').then((gs) => gs.unregister(registered))
    }
  }, [enabled])
}

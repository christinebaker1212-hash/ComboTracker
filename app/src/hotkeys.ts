// Global hotkeys: work while the game has focus (desktop app only).
import { toggleOverlay, toggleViewer, useLock, useScenes } from './overlays'
import { restartPractice } from './platform'

export interface Hotkey { keys: string; label: string; run: () => void }

const MOD = 'CommandOrControl+Alt+'

export const HOTKEYS: Hotkey[] = [
  { keys: `${MOD}O`, label: 'Show / hide the overlay', run: () => void toggleOverlay() },
  { keys: `${MOD}L`, label: 'Lock / unlock overlays (click-through)', run: () => useLock.getState().toggle() },
  { keys: `${MOD}R`, label: 'Restart practice', run: restartPractice },
  { keys: `${MOD}V`, label: 'Show / hide the input viewer', run: () => void toggleViewer() },
  ...Array.from({ length: 9 }, (_, i): Hotkey => ({
    keys: `${MOD}${i + 1}`,
    label: `Scene ${i + 1}`,
    run: () => {
      const scene = useScenes.getState().scenes[i]
      if (scene) void useScenes.getState().apply(scene.name)
    },
  })),
]

/** "CommandOrControl+Alt+O" → "Ctrl+Alt+O" for display. */
export const hotkeyLabel = (keys: string) => keys.replace('CommandOrControl', 'Ctrl')

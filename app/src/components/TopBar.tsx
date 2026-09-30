import {
  BookOpen, Download, Lock, LockOpen, Gamepad2, Layers, MonitorUp, Palette as PaletteIcon, Redo2, Swords, Undo2, Upload,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { fetchPreset, presetName, useAssets } from '../assets'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import { compileTheme, type ThemeFile } from '../core/theme'
import { useStore } from '../store/useStore'
import { exportCurrentList, useLoadCombos } from '../actions'
import { isDesktop, openOverlay, setOverlayLocked } from '../platform'
import { Menu } from './Menu'
import { treeFromPaths } from './menuTree'

export function TopBar({ pad }: { pad: string | null }) {
  const { manifest } = useAssets()
  const glyph = useStore((s) => s.glyph)
  const setGlyph = useStore((s) => s.setGlyph)
  const theme = useStore((s) => s.theme)
  const themePath = useStore((s) => s.themePath)
  const setTheme = useStore((s) => s.setTheme)
  const player = useStore((s) => s.player)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const notify = useStore((s) => s.notify)
  const loadCombos = useLoadCombos()
  const fileRef = useRef<HTMLInputElement>(null)

  const loadPreset = (folder: 'combos' | 'commandLists') => (path: string) =>
    fetchPreset(folder, path)
      .then((json) => loadCombos(json, presetName(path)))
      .catch((e: Error) => notify(e.message, 'error'))

  const loadTheme = (path: string) =>
    fetchPreset('themes', path)
      .then((json) => setTheme(compileTheme(presetName(path), json as ThemeFile), path))
      .catch((e: Error) => notify(e.message, 'error'))

  const [locked, setLocked] = useState(false)
  const openOverlayWindow = async () => {
    const ok = await openOverlay(player)
    if (!ok) notify('Your browser blocked the overlay window. Allow pop-ups for this page.', 'error')
  }
  const toggleLock = () => {
    setLocked(!locked)
    setOverlayLocked(player, !locked)
    notify(!locked ? 'Overlay locked: clicks now pass through to your game.' : 'Overlay unlocked: drag it to move, scroll to resize.')
  }

  return (
    <header className="topbar">
      <div className="brand">
        <Swords size={20} />
        <span>ComboTracker</span>
      </div>

      <div className="topbar-group">
        <Menu
          title="Button icon style"
          trigger={<><Layers size={15} /> {glyph.name}</>}
          items={BUILTIN_GLYPHS.map((g) => ({
            label: g.name,
            checked: g.name === glyph.name,
            onSelect: () => setGlyph(g),
          }))}
        />
        <Menu
          title="Theme"
          trigger={<><PaletteIcon size={15} /> {theme.name}</>}
          items={treeFromPaths(manifest.presets.themes, loadTheme, (p) => p === themePath)}
        />
      </div>

      <div className="topbar-group">
        <Menu
          title="Load a preset combo list"
          trigger={<><Swords size={15} /> Combos</>}
          items={treeFromPaths(manifest.presets.combos, loadPreset('combos'))}
        />
        <Menu
          title="Load a character's command list"
          trigger={<><BookOpen size={15} /> Command lists</>}
          items={treeFromPaths(manifest.presets.commandLists, loadPreset('commandLists'))}
        />
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-group">
        <span className={`pad-status${pad ? ' is-on' : ''}`} title={pad ?? 'Press any button on a controller to connect it'}>
          <Gamepad2 size={16} /> {pad ? 'Controller' : 'No controller'}
        </span>
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 size={17} /></button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Open a combo file (.json)">
          <Upload size={15} /> Open
        </button>
        <button className="btn" onClick={exportCurrentList} title="Save this player's combos (Ctrl+S)">
          <Download size={15} /> Save
        </button>
        <button className="btn btn-accent" onClick={openOverlayWindow} title="Open pinned combos in a separate window">
          <MonitorUp size={15} /> Overlay
        </button>
        {isDesktop && (
          <button
            className={`icon-btn${locked ? ' is-on' : ''}`}
            onClick={toggleLock}
            title={locked ? 'Unlock overlay (make it movable)' : 'Lock overlay (clicks pass through to the game)'}
          >
            {locked ? <Lock size={16} /> : <LockOpen size={16} />}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              loadCombos(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ''))
            } catch {
              notify(`${file.name} isn't valid JSON.`, 'error')
            }
          }}
        />
      </div>
    </header>
  )
}

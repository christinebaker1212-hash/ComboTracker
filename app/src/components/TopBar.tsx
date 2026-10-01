import {
  BookOpen, Download, FolderOpen, Gamepad2, HelpCircle, Layers, Lock, LockOpen, MonitorUp, Palette as PaletteIcon,
  Pencil, Plus, Redo2, Save, Search, Settings, Share2, Swords, Undo2, X,
} from 'lucide-react'
import { useState } from 'react'
import { presetName, useAssets } from '../assets'
import { exportCurrentList, loadPreset, loadThemeRef, openAnyFile } from '../actions'
import { BUILTIN_GLYPHS } from '../core/glyphs'
import { isDesktop, openOverlay, openViewer, overlaysLocked, setOverlaysLocked } from '../platform'
import { presetRef, useLibrary } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Menu } from './Menu'
import { SEPARATOR, treeFromPaths, type MenuItem } from './menuTree'

/** Built-in presets plus the user's own, merged by game folder; the user's are marked. */
function presetTree(builtin: string[], user: string[], onSelect: (ref: string) => void): MenuItem[] {
  const refs = [...user.map((p) => presetRef('user', p)), ...builtin.map((p) => presetRef('builtin', p))]
  const paths = refs.map((r) => r.slice(r.indexOf(':') + 1))
  const tree = treeFromPaths(paths, () => {}, undefined)
  // Re-bind leaves to their refs (a path can exist both built-in and user).
  const bind = (items: MenuItem[], prefix: string): MenuItem[] =>
    items.flatMap((it): MenuItem[] => {
      if (it.children) return [{ ...it, children: bind(it.children, `${prefix}${it.label}/`) }]
      const path = `${prefix}${it.label}.json`
      return refs
        .filter((r) => r.endsWith(`:${path}`))
        .map((r) => ({ ...it, hint: r.startsWith('user:') ? 'yours' : undefined, onSelect: () => onSelect(r) }))
    })
  return bind(tree, '')
}

export function TopBar({ pad, searchRef }: { pad: string | null; searchRef: React.RefObject<HTMLInputElement | null> }) {
  const { manifest } = useAssets()
  const user = useLibrary((s) => s.user)
  const userGlyphs = useLibrary((s) => s.userGlyphs)
  const glyph = useStore((s) => s.glyph)
  const setGlyph = useStore((s) => s.setGlyph)
  const theme = useStore((s) => s.theme)
  const themePath = useStore((s) => s.themePath)
  const player = useStore((s) => s.player)
  const overlayMode = useStore((s) => s.settings.overlayMode)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const notify = useStore((s) => s.notify)
  const open = useUI((s) => s.open)
  const search = useUI((s) => s.search)
  const setSearch = useUI((s) => s.setSearch)
  // Overlays start unlocked each session, so nobody gets stuck with a window they can't move.
  const [locked, setLocked] = useState(() => {
    if (overlaysLocked()) setOverlaysLocked(false)
    return false
  })

  const showOverlay = async () => {
    if (overlayMode === 'separate') {
      const pinned = useStore.getState().lists[player].filter((c) => c.pinned)
      if (!pinned.length) {
        notify('Pin some combos first (📌 on each row). Each one opens in its own window.')
        return
      }
      for (const c of pinned) await openOverlay(player, c.id)
      return
    }
    if (!(await openOverlay(player))) notify('Your browser blocked the overlay window. Allow pop-ups for this page.', 'error')
  }

  const toggleLock = () => {
    setOverlaysLocked(!locked)
    setLocked(!locked)
    notify(!locked ? 'Overlays locked: clicks pass through to your game.' : 'Overlays unlocked: drag to move, scroll to resize.')
  }

  const glyphItems: MenuItem[] = [
    ...BUILTIN_GLYPHS.map((g) => ({ label: g.name, checked: g.name === glyph.name, onSelect: () => setGlyph(g) })),
    ...(userGlyphs.length
      ? [SEPARATOR, { label: 'Your styles', children: userGlyphs.map((g) => ({ label: g.name, checked: g.name === glyph.name, onSelect: () => setGlyph(g) })) }]
      : []),
    SEPARATOR,
    { label: 'New icon style…', icon: <Plus size={14} />, onSelect: () => open({ kind: 'glyph' }) },
    ...(glyph.source === 'user' ? [{ label: `Edit “${glyph.name}”…`, icon: <Pencil size={14} />, onSelect: () => open({ kind: 'glyph', edit: glyph.name }) }] : []),
  ]

  const themeItems: MenuItem[] = [
    ...(user.themes.length
      ? [{ label: 'My themes', children: user.themes.map((p) => ({ label: presetName(p), checked: themePath === presetRef('user', p), onSelect: () => void loadThemeRef(presetRef('user', p)) })) }]
      : []),
    ...treeFromPaths(manifest.presets.themes, (p) => void loadThemeRef(presetRef('builtin', p)), (p) => themePath === presetRef('builtin', p) || themePath === p),
    SEPARATOR,
    { label: 'Customize this theme…', icon: <Pencil size={14} />, onSelect: () => open({ kind: 'theme' }) },
  ]

  const presetItems: MenuItem[] = [
    { label: 'Combos', children: presetTree(manifest.presets.combos, user.combos, (r) => void loadPreset('combos', r)) },
    { label: 'Command lists', children: presetTree(manifest.presets.commandLists, user.commandLists, (r) => open({ kind: 'moves', ref: r })) },
    SEPARATOR,
    { label: 'Open a file…', icon: <FolderOpen size={14} />, onSelect: () => void openAnyFile() },
    { label: 'Use a share code…', icon: <Share2 size={14} />, onSelect: () => open({ kind: 'share', code: ' ' }) },
  ]

  const saveItems: MenuItem[] = [
    { label: 'Save to a file…', hint: 'Ctrl+S', icon: <Download size={14} />, onSelect: () => void exportCurrentList() },
    { label: 'Save as my preset…', icon: <BookOpen size={14} />, onSelect: () => open({ kind: 'savePreset' }) },
    { label: 'Get a share code…', icon: <Share2 size={14} />, onSelect: () => open({ kind: 'share' }) },
  ]

  return (
    <header className="topbar">
      <div className="brand">
        <Swords size={20} />
        <span>ComboTracker</span>
      </div>

      <div className="topbar-group">
        <button className="btn btn-accent" onClick={() => open({ kind: 'moves' })} title="A character's moves, like the in-game command list">
          <BookOpen size={15} /> Move list
        </button>
        <Menu title="Load combos or a character's moves" trigger={<><FolderOpen size={15} /> Presets</>} items={presetItems} />
        <Menu title="Save or share this list" trigger={<><Save size={15} /> Save</>} items={saveItems} />
      </div>

      <div className="topbar-group">
        <Menu title="Button icon style" trigger={<><Layers size={15} /> <span className="btn-label">{glyph.name}</span></>} items={glyphItems} />
        <Menu title="Colour theme" trigger={<><PaletteIcon size={15} /> <span className="btn-label">{theme.name}</span></>} items={themeItems} />
      </div>

      <div className="topbar-spacer" />

      <div className="search">
        <Search size={15} />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search combos"
          aria-label="Search combos (Ctrl+F)"
          onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
        />
        {search && <button className="icon-btn" onClick={() => setSearch('')} title="Clear search"><X size={14} /></button>}
      </div>

      <div className="topbar-group">
        <button
          className={`pad-status${pad ? ' is-on' : ''}`}
          title={pad ? `${pad}\nClick for controller settings` : 'No controller found. Plug one in and press any button.'}
          onClick={() => open({ kind: 'settings' })}
        >
          <Gamepad2 size={16} /> {pad ? 'Controller' : 'No controller'}
        </button>
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 size={17} /></button>
        <button className="btn" onClick={() => void openViewer()} title="Show your controller on screen, lighting up as you press buttons">
          <Gamepad2 size={15} /> Input viewer
        </button>
        <button className="btn btn-accent" onClick={() => void showOverlay()} title="Show pinned combos on top of your game">
          <MonitorUp size={15} /> Overlay
        </button>
        {isDesktop && (
          <button
            className={`icon-btn${locked ? ' is-on' : ''}`}
            onClick={toggleLock}
            title={locked ? 'Unlock overlays so you can move them' : 'Lock overlays so clicks go through to your game'}
          >
            {locked ? <Lock size={16} /> : <LockOpen size={16} />}
          </button>
        )}
        <button className="icon-btn" onClick={() => open({ kind: 'help' })} title="How to use ComboTracker"><HelpCircle size={17} /></button>
        <button className="icon-btn" onClick={() => open({ kind: 'settings' })} title="Settings"><Settings size={17} /></button>
      </div>
    </header>
  )
}

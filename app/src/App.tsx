import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { exportCurrentList, openFile } from './actions'
import { AssetsContext, useManifest } from './assets'
import { ComboList } from './components/ComboList'
import { GlyphEditor } from './components/GlyphEditor'
import { HelpDialog } from './components/HelpDialog'
import { InputHistoryWindow } from './components/InputHistory'
import { InputViewer } from './components/InputViewer'
import { LayoutEditor } from './components/LayoutEditor'
import { MoveListPanel } from './components/MoveListPanel'
import { Overlay } from './components/Overlay'
import { Palette } from './components/Palette'
import { PracticeOverlay } from './components/PracticeOverlay'
import { ScenesDialog } from './components/ScenesDialog'
import { FirstRun } from './components/FirstRun'
import { DrillDialog } from './components/DrillDialog'
import { SavePresetDialog } from './components/SavePresetDialog'
import { SettingsPanel } from './components/SettingsPanel'
import { ShareDialog } from './components/ShareDialog'
import { ThemeEditor } from './components/ThemeEditor'
import { TopBar } from './components/TopBar'
import { themeToCss } from './core/theme'
import { useGamepad } from './hooks/useGamepad'
import { useKeyboard } from './hooks/useKeyboard'
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys'
import { useObsHost } from './hooks/useObsHost'
import { usePadSuggest } from './hooks/usePadSuggest'
import { DEFAULT_KEYBOARD } from './core/keyboard'
import { setKeyboardConfig } from './nativePads'
import { onMainMessage } from './platform'
import { needsSetup } from './setup'
import { useLibrary } from './store/useLibrary'
import { savedGlyphName, useStore, type Player } from './store/useStore'
import { useUI } from './store/useUI'

function Toast() {
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    // Undo offers stay up a little longer so there's time to reach the button.
    const t = setTimeout(() => useStore.setState({ toast: null }), toast.tone === 'error' ? 7000 : toast.action ? 6500 : 4000)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  const dismiss = () => useStore.setState({ toast: null })
  return (
    <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
      <span onClick={dismiss}>{toast.text}</span>
      {toast.action && (
        <button className="toast-action" onClick={() => { toast.action!.run(); dismiss() }}>{toast.action.label}</button>
      )}
    </div>
  )
}

function Dialogs() {
  const d = useUI((s) => s.dialog)
  if (!d) return null
  switch (d.kind) {
    case 'theme': return <ThemeEditor />
    case 'glyph': return <GlyphEditor key={d.edit ?? 'new'} edit={d.edit} />
    case 'settings': return <SettingsPanel />
    case 'layout': return <LayoutEditor initialRef={d.ref} />
    case 'share': return <ShareDialog code={d.code} />
    case 'savePreset': return <SavePresetDialog />
    case 'help': return <HelpDialog />
    case 'moves': return <MoveListPanel initial={d.ref} />
    case 'scenes': return <ScenesDialog />
    case 'setup': return <FirstRun />
    case 'drill': return <DrillDialog />
  }
}

/** Drop any ComboTracker file anywhere on the window to open it. */
function useFileDrop() {
  const [over, setOver] = useState(false)
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return {
    over,
    handlers: {
      onDragEnter: (e: React.DragEvent) => hasFiles(e) && setOver(true),
      onDragOver: (e: React.DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.relatedTarget || !(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(false)
      },
      onDrop: (e: React.DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(false)
        void (async () => {
          for (const f of e.dataTransfer.files) await openFile(f)
        })()
      },
    },
  }
}

function Editor() {
  const theme = useStore((s) => s.theme)
  const settings = useStore((s) => s.settings)
  const open = useUI((s) => s.open)
  const drop = useFileDrop()
  useGlobalHotkeys(settings.hotkeys)
  usePadSuggest()
  useObsHost()
  useEffect(() => {
    if (needsSetup()) open({ kind: 'setup' })
  }, [open])
  useEffect(() => setKeyboardConfig(settings.keyboard ?? DEFAULT_KEYBOARD), [settings.keyboard])
  // The practice window saves a combo's reference rhythm through here.
  useEffect(
    () => onMainMessage<{ player: Player; comboId: string; timing: number[] }>('set-timing', ({ player, comboId, timing }) => {
      useStore.setState((s) => ({
        lists: { ...s.lists, [player]: s.lists[player].map((c) => (c.id === comboId ? { ...c, timing } : c)) },
      }))
    }),
    [],
  )
  const notationRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pad = useGamepad()
  useKeyboard(notationRef, searchRef, exportCurrentList)

  const classes = [
    'app',
    theme.gradMain && 'grad-main',
    theme.gradCombos && 'grad-combos',
    theme.gradButtons && 'grad-buttons',
    theme.gradStandard && 'grad-standard',
    theme.paletteStyle === 'Classic' && 'palette-classic',
    `size-${settings.uiSize}`,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} style={themeToCss(theme) as CSSProperties} {...drop.handlers}>
      <TopBar pad={pad} />
      <main className="workspace">
        <Palette ref={notationRef} />
        <ComboList searchRef={searchRef} />
      </main>
      <Dialogs />
      <Toast />
      {drop.over && (
        <div className="drop-zone">
          <div>
            <strong>Drop to open</strong>
            <span>Combo lists, move lists, themes, icon styles and controller layouts</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const assets = useManifest()
  const refresh = useLibrary((s) => s.refresh)
  const params = new URLSearchParams(location.search)
  const view = params.get('view')
  const player: Player = params.get('p') === 'P2' ? 'P2' : 'P1'

  // Load the user's own themes, icon styles, layouts and presets. If the last
  // session used one of their icon styles, switch back to it once it's loaded.
  useEffect(() => {
    void refresh().then(() => {
      const name = savedGlyphName()
      const userPack = useLibrary.getState().userGlyphs.find((g) => g.name === name)
      if (userPack) useStore.getState().setGlyph(userPack)
    })
  }, [refresh])

  if (!assets) return <div className="loading">Loading…</div>
  return (
    <AssetsContext.Provider value={assets}>
      {view === 'overlay' ? (
        <Overlay player={player} comboId={params.get('combo') ?? undefined} />
      ) : view === 'practice' ? (
        <PracticeOverlay
          player={player}
          comboId={params.get('combo') ?? ''}
          drill={params.get('drill') ? {
            ids: params.get('drill')!.split(','),
            reps: Math.max(1, Number(params.get('reps')) || 3),
            shuffled: params.get('order') === 'random',
          } : undefined}
        />
      ) : view === 'viewer' ? (
        <InputViewer />
      ) : view === 'history' ? (
        <InputHistoryWindow />
      ) : (
        <Editor />
      )}
    </AssetsContext.Provider>
  )
}

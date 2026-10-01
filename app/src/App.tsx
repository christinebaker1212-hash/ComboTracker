import { useEffect, useRef, type CSSProperties } from 'react'
import { exportCurrentList } from './actions'
import { AssetsContext, useManifest } from './assets'
import { ComboList } from './components/ComboList'
import { GlyphEditor } from './components/GlyphEditor'
import { HelpDialog } from './components/HelpDialog'
import { InputViewer } from './components/InputViewer'
import { LayoutEditor } from './components/LayoutEditor'
import { Overlay } from './components/Overlay'
import { Palette } from './components/Palette'
import { PracticePanel } from './components/PracticePanel'
import { SavePresetDialog } from './components/SavePresetDialog'
import { SettingsPanel } from './components/SettingsPanel'
import { ShareDialog } from './components/ShareDialog'
import { ThemeEditor } from './components/ThemeEditor'
import { TopBar } from './components/TopBar'
import { themeToCss } from './core/theme'
import { useGamepad } from './hooks/useGamepad'
import { useKeyboard } from './hooks/useKeyboard'
import { useLibrary } from './store/useLibrary'
import { savedGlyphName, useStore, type Player } from './store/useStore'
import { useUI } from './store/useUI'

function Toast() {
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useStore.setState({ toast: null }), toast.tone === 'error' ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.tone}`} role="status" onClick={() => useStore.setState({ toast: null })}>
      {toast.text}
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
    case 'practice': return <PracticePanel comboId={d.comboId} />
    case 'share': return <ShareDialog code={d.code} />
    case 'savePreset': return <SavePresetDialog />
    case 'help': return <HelpDialog />
  }
}

function Editor() {
  const theme = useStore((s) => s.theme)
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
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} style={themeToCss(theme) as CSSProperties}>
      <TopBar pad={pad} searchRef={searchRef} />
      <main className="workspace">
        <Palette ref={notationRef} />
        <ComboList />
      </main>
      <Dialogs />
      <Toast />
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
      ) : view === 'viewer' ? (
        <InputViewer />
      ) : (
        <Editor />
      )}
    </AssetsContext.Provider>
  )
}

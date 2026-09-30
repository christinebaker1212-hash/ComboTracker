import { useEffect, useRef, type CSSProperties } from 'react'
import { exportCurrentList } from './actions'
import { AssetsContext, useManifest } from './assets'
import { ComboList } from './components/ComboList'
import { Overlay } from './components/Overlay'
import { Palette } from './components/Palette'
import { TopBar } from './components/TopBar'
import { themeToCss } from './core/theme'
import { useGamepad } from './hooks/useGamepad'
import { useKeyboard } from './hooks/useKeyboard'
import { useStore, type Player } from './store/useStore'

function Toast() {
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useStore.setState({ toast: null }), toast.tone === 'error' ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.tone}`} role="status" onClick={() => useStore.setState({ toast: null })}>
      {toast.text}
    </div>
  )
}

function Editor() {
  const theme = useStore((s) => s.theme)
  const notationRef = useRef<HTMLInputElement>(null)
  const pad = useGamepad()
  useKeyboard(notationRef, exportCurrentList)

  return (
    <div
      className={`app${theme.gradMain ? ' grad-main' : ''}${theme.gradCombos ? ' grad-combos' : ''}${theme.gradButtons ? ' grad-buttons' : ''}`}
      style={themeToCss(theme) as CSSProperties}
    >
      <TopBar pad={pad} />
      <main className="workspace">
        <Palette ref={notationRef} />
        <ComboList />
      </main>
      <Toast />
    </div>
  )
}

export default function App() {
  const assets = useManifest()
  const params = new URLSearchParams(location.search)
  const overlayFor = params.get('view') === 'overlay' ? ((params.get('p') === 'P2' ? 'P2' : 'P1') as Player) : null

  if (!assets) return <div className="loading">Loading…</div>
  return (
    <AssetsContext.Provider value={assets}>
      {overlayFor ? <Overlay player={overlayFor} /> : <Editor />}
    </AssetsContext.Provider>
  )
}

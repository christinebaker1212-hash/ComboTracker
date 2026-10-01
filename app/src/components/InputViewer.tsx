import { Image as ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePadState } from '../hooks/usePadState'
import type { Layout } from '../core/layouts'
import { loadLayout } from '../store/useLibrary'
import { useShared } from '../hooks/useShared'
import { FloatingShell } from './Floating'
import { LayoutView } from './LayoutView'

const LOOK_KEY = 'combotracker:viewer:look'

/** Live controller display in its own floating window. */
export function InputViewer() {
  const { glyph, theme, settings } = useShared()
  const state = usePadState(settings.padIndex)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showImage, setShowImage] = useState(() => {
    try {
      return localStorage.getItem(LOOK_KEY) !== 'no-image'
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (!settings.viewerLayout) return
    loadLayout(settings.viewerLayout)
      .then((l) => {
        setLayout(l)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
  }, [settings.viewerLayout])

  const toggleImage = () => {
    setShowImage((v) => {
      try {
        localStorage.setItem(LOOK_KEY, v ? 'no-image' : '')
      } catch {
        // Harmless.
      }
      return !v
    })
  }

  return (
    <FloatingShell
      prefKey="combotracker:viewer"
      title="Input viewer"
      theme={theme}
      defaults={{ scale: 1.5 }}
      extraTools={
        <button className={`icon-btn${showImage ? ' is-on' : ''}`} onClick={toggleImage} title="Show the controller picture">
          <ImageIcon size={14} />
        </button>
      }
    >
      {(scale) =>
        layout ? (
          <LayoutView layout={layout} state={state} glyph={glyph} theme={theme} scale={scale} look={{ outline: 2, highlight: 3, showImage }} />
        ) : (
          <p className="overlay-empty">{error ?? 'Choose a controller layout in Settings.'}</p>
        )
      }
    </FloatingShell>
  )
}

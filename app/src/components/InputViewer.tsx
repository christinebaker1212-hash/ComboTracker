import { Image as ImageIcon, ListOrdered } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePadState } from '../hooks/usePadState'
import type { Layout } from '../core/layouts'
import { loadLayout } from '../store/useLibrary'
import { useShared } from '../hooks/useShared'
import { FloatingShell } from './Floating'
import { HistoryList } from './InputHistory'
import { LayoutView } from './LayoutView'

const LOOK_KEY = 'combotracker:viewer:look'
const HISTORY_KEY = 'combotracker:viewer:history'

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Harmless.
  }
}

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

  const [showHistory, setShowHistory] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_KEY) === '1'
    } catch {
      return false
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
      remember(LOOK_KEY, v ? 'no-image' : '')
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
        <>
          <button className={`icon-btn${showImage ? ' is-on' : ''}`} onClick={toggleImage} title="Show the controller body">
            <ImageIcon size={14} />
          </button>
          <button
            className={`icon-btn${showHistory ? ' is-on' : ''}`}
            onClick={() => setShowHistory((v) => {
              remember(HISTORY_KEY, v ? '' : '1')
              return !v
            })}
            title="Show your recent inputs with frame counts next to the controller"
          >
            <ListOrdered size={14} />
          </button>
        </>
      }
    >
      {(scale) => (
        <div className="viewer-row">
          {layout ? (
            <LayoutView layout={layout} state={state} glyph={glyph} theme={theme} scale={scale} look={{ outline: 2, highlight: 3, showImage }} />
          ) : (
            <p className="overlay-empty">{error ?? 'Choose a controller layout in Settings.'}</p>
          )}
          {showHistory && (
            <div className="viewer-history">
              <HistoryList padIndex={settings.padIndex} glyph={glyph} scale={scale * 0.8} rows={12} />
            </div>
          )}
        </div>
      )}
    </FloatingShell>
  )
}

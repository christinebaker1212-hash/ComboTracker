import { afterEach, describe, expect, it, vi } from 'vitest'
import { inputBus } from './inputBus'
import { useRecorder } from './recorder'
import { useStore } from './store/useStore'

describe('recording a combo', () => {
  afterEach(() => vi.useRealTimers())

  it('writes inputs, marks pauses with dl. and saves the rhythm', () => {
    vi.useFakeTimers()
    const s = useStore.getState()
    const id = s.selected[s.player]
    useRecorder.getState().start()
    inputBus.emit({ type: 'insert', tokens: ['down'] }, 0)
    inputBus.emit({ type: 'insert', tokens: ['mk'] }, 20)
    inputBus.emit({ type: 'insert', tokens: ['hp'] }, 220) // 12 frames later
    inputBus.emit({ type: 'insert', tokens: ['hk'] }, 1220) // 60 frames: a delay
    useRecorder.getState().stop()
    const combo = useStore.getState().lists[s.player].find((c) => c.id === id)!
    expect(combo.tokens).toEqual(['down', 'plus', 'mk', 'goes_into', 'hp', 'goes_into', 'note:dl.', 'hk'])
    expect(combo.timing).toEqual([12, 60])
    expect(useRecorder.getState().comboId).toBeNull()
  })

  it('stops by itself after a few idle seconds', () => {
    vi.useFakeTimers()
    useRecorder.getState().start()
    inputBus.emit({ type: 'insert', tokens: ['lp'] }, 0)
    expect(useRecorder.getState().comboId).not.toBeNull()
    vi.advanceTimersByTime(3100)
    expect(useRecorder.getState().comboId).toBeNull()
  })
})

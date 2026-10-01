import { describe, expect, it } from 'vitest'
import { parseComboFile, toComboFile, makeCombo } from './combos'
import { buttonGaps, buttonSteps, feedPractice, judge, referenceFits, startPractice, stepsFor } from './practice'

describe('practice timing', () => {
  // ↓+MK ➔ QCF+HP: steps ↓ MK ↓ ↘ → HP, buttons at steps 1 and 5.
  const steps = stepsFor(['down', 'plus', 'mk', 'goes_into', 'qcf', 'plus', 'hp'])

  it('times links between button presses only', () => {
    expect(buttonSteps(steps)).toEqual([1, 5])
    const times = [0, 16, 100, 120, 140, 216]
    expect(buttonGaps(steps, times)).toEqual([12])
  })

  it('judges early, on time and late within a frame', () => {
    expect(judge(12, 12).verdict).toBe('ok')
    expect(judge(13, 12).verdict).toBe('ok')
    expect(judge(9, 12)).toEqual({ verdict: 'early', off: -3 })
    expect(judge(15, 12)).toEqual({ verdict: 'late', off: 3 })
  })

  it('keeps the last clean run', () => {
    let s = startPractice(steps)
    ;['down', 'mk', 'down', 'downright', 'right', 'hp'].forEach((t, i) => { s = feedPractice(s, t, i * 50) })
    expect(s.completions).toBe(1)
    expect(s.lastRun).toEqual([0, 50, 100, 150, 200, 250])
    expect(buttonGaps(steps, s.lastRun)).toEqual([12])
  })

  it('only uses a reference that matches the number of presses', () => {
    expect(referenceFits(steps, [12])).toBe(true)
    expect(referenceFits(steps, [12, 8])).toBe(false)
    expect(referenceFits(steps, undefined)).toBe(false)
  })

  it('saves the rhythm in combo files', () => {
    const c = { ...makeCombo('BnB', ['lp']), timing: [12, 8] }
    const back = parseComboFile(JSON.parse(JSON.stringify(toComboFile([c], 'Default'))))
    expect(back.combos[0].timing).toEqual([12, 8])
    expect(parseComboFile({ slots: [{ name: 'x', tokens: [], timing: ['bad'] }] }).combos[0].timing).toBeUndefined()
  })
})

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { advantage, advantageSign, frameSummary, parseMoveList } from './movelist'

describe('frame data', () => {
  it('formats advantage and its sign', () => {
    expect(advantage(4)).toBe('+4')
    expect(advantage(-1)).toBe('-1')
    expect(advantage('KD +38')).toBe('KD +38')
    expect(advantageSign(-3)).toBe('minus')
    expect(advantageSign('+2(crumple)')).toBe('plus')
    expect(advantageSign('KD +38')).toBe('plus')
    expect(advantageSign(0)).toBe('even')
  })

  it('summarises the first version for combos', () => {
    expect(frameSummary([{ startup: 5, onBlock: -1, onHit: 4 }])).toBe('5f startup · -1 on block · +4 on hit')
    expect(frameSummary([{ label: 'LP', startup: 16, onBlock: -5 }])).toBe('LP: 16f startup · -5 on block')
    expect(frameSummary(undefined)).toBeUndefined()
  })

  it('reads the generated move lists, normals included', () => {
    const json = JSON.parse(readFileSync(new URL('../../../Presets/Command Lists/Street Fighter 6/Ryu.json', import.meta.url), 'utf8'))
    const list = parseMoveList(json)
    const normals = list.sections.find((s) => s.title === 'Normal moves')!
    const jab = normals.moves.find((m) => m.name === 'Stand LP')!
    expect(jab.tokens).toEqual(['lp'])
    expect(jab.frames?.[0].startup).toBeTypeOf('number')
    const hadoken = list.sections.flatMap((s) => s.moves).find((m) => m.name === 'Hadoken')!
    expect(hadoken.frames?.map((f) => f.label)).toEqual(['LP', 'MP', 'HP', 'OD'])
  })
})

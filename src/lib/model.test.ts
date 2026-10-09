import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATE, fromUnit, invalidFields, loadState, saveState, toUnit } from './model'

afterEach(() => vi.unstubAllGlobals())

describe('units', () => {
  it('converts inches both ways and leaves cm alone', () => {
    expect(toUnit(254, 'in')).toBeCloseTo(100)
    expect(fromUnit(100, 'in')).toBeCloseTo(254)
    expect(toUnit(80, 'cm')).toBe(80)
    expect(fromUnit(80, 'cm')).toBe(80)
  })
  it('round-trips a typed inch value', () => {
    expect(+toUnit(fromUnit(31.5, 'in'), 'in').toFixed(2)).toBe(31.5)
  })
})

describe('invalidFields', () => {
  it('accepts the defaults', () => {
    expect(invalidFields(DEFAULT_STATE).size).toBe(0)
  })
  it('flags zero, NaN and over-limit lengths by field', () => {
    const s = structuredClone(DEFAULT_STATE)
    s.item.length = 0
    s.item.width = NaN
    s.item.height = 5000
    expect([...invalidFields(s)].sort()).toEqual(['item.height', 'item.length', 'item.width'])
  })
  it('allows zero clearance but not negative or over 20 cm', () => {
    const s = structuredClone(DEFAULT_STATE)
    s.settings.clearance = 0
    expect(invalidFields(s).size).toBe(0)
    s.settings.clearance = -1
    expect(invalidFields(s).has('settings.clearance')).toBe(true)
    s.settings.clearance = 21
    expect(invalidFields(s).has('settings.clearance')).toBe(true)
  })
  it('treats an empty hallway width as open space but flags a bad one', () => {
    const s = structuredClone(DEFAULT_STATE)
    const d = s.steps[0]
    if (d.kind !== 'doorway') throw new Error('default route starts with a doorway')
    d.approachWidth = undefined
    expect(invalidFields(s).size).toBe(0)
    d.approachWidth = -5
    expect(invalidFields(s).has(`${d.id}.approachWidth`)).toBe(true)
  })
  it('flags bad step fields with the step id', () => {
    const s = structuredClone(DEFAULT_STATE)
    const t = s.steps[1]
    if (t.kind !== 'turn') throw new Error('default route has a turn second')
    t.ceiling = NaN
    expect([...invalidFields(s)]).toEqual([`${t.id}.ceiling`])
  })
})

describe('storage', () => {
  const fakeStorage = (initial: string | null) => {
    let v = initial
    return { getItem: () => v, setItem: (_: string, x: string) => { v = x } }
  }
  it('falls back to defaults without storage', () => {
    expect(loadState().item).toEqual(DEFAULT_STATE.item)
  })
  it('loadState ignores corrupt storage', () => {
    vi.stubGlobal('localStorage', fakeStorage('{not json'))
    expect(loadState().steps).toEqual(DEFAULT_STATE.steps)
    vi.stubGlobal('localStorage', fakeStorage('{"item":1,"settings":null,"steps":"x"}'))
    expect(loadState().item).toEqual(DEFAULT_STATE.item)
  })
  it('drops malformed steps and unknown settings values from storage', () => {
    vi.stubGlobal('localStorage', fakeStorage(JSON.stringify({
      item: { length: 150, width: 60, height: 50 },
      settings: { clearance: 2, unit: 'in', lang: 'xx', quality: 'ultra', theme: 'neon' },
      steps: [{}, null, { kind: 'door', id: 'a' }, { id: 'ok', kind: 'turn', entryWidth: 90, exitWidth: 90, ceiling: 250 }],
    })))
    const s = loadState()
    expect(s.steps).toEqual([{ id: 'ok', kind: 'turn', entryWidth: 90, exitWidth: 90, ceiling: 250 }])
    expect(s.settings).toEqual({ ...DEFAULT_STATE.settings, clearance: 2, unit: 'in' })
    expect(s.item.length).toBe(150)
    expect(() => invalidFields(s)).not.toThrow()
  })
  it('round-trips through saveState', () => {
    vi.stubGlobal('localStorage', fakeStorage(null))
    const s = structuredClone(DEFAULT_STATE)
    s.item.length = 123
    s.settings.unit = 'in'
    saveState(s)
    const back = loadState()
    expect(back.item.length).toBe(123)
    expect(back.settings.unit).toBe('in')
  })
})

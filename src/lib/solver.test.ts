import { describe, expect, it } from 'vitest'
import { holdAt, MAX_MARGIN, solveStep } from './solver'
import type { DoorwayStep, TurnStep } from './model'

/** Longest flat w-wide box that rounds a corner of corridor widths a and b (classic formula, minimised numerically). */
function lMax(a: number, b: number, w: number) {
  let m = Infinity
  for (let t = 0.001; t < Math.PI / 2; t += 0.0005) m = Math.min(m, a / Math.sin(t) + b / Math.cos(t) - w / (Math.sin(t) * Math.cos(t)))
  return m
}
const turn = (entryWidth: number, exitWidth: number, ceiling: number): TurnStep => ({ id: 't', kind: 'turn', entryWidth, exitWidth, ceiling })
const door = (width: number, height: number, approachWidth?: number): DoorwayStep => ({ id: 'd', kind: 'doorway', width, height, wallThickness: 12, approachWidth })
const flat2d = { ups: ['flat' as const], maxPitchDeg: 0 }

describe('turn kept flat matches the 2D corner formula', () => {
  const L = lMax(90, 90, 60) // ≈ 134.6 cm
  it('passes 15 cm under the limit', () => {
    const r = solveStep(turn(90, 90, 1000), { length: L - 15, width: 60, height: 40 }, 0, 'medium', flat2d)
    expect(r.fits).toBe(true)
    expect(r.path.length).toBeGreaterThan(1)
  })
  it('fails 15 cm over the limit', () => {
    expect(solveStep(turn(90, 90, 1000), { length: L + 15, width: 60, height: 40 }, 0, 'medium', flat2d).fits).toBe(false)
  })
})

describe('doorway', () => {
  it('passes a narrower item with half the gap as margin and no tilt', () => {
    const r = solveStep(door(80, 200), { length: 180, width: 70, height: 70 }, 0, 'low')
    expect(r.fits).toBe(true)
    expect(r.margin).toBeGreaterThan(3)
    expect(r.margin).toBeLessThanOrEqual(5.01)
    expect(r.tilt).toBe(0)
  })
  it('fails when the item is wider than the opening every way', () => {
    const r = solveStep(door(80, 200), { length: 180, width: 90, height: 90 }, 0, 'low')
    expect(r.fits).toBe(false)
    expect(r.margin).toBeLessThan(-3)
    expect(r.path).toEqual([])
    expect(r.up).toBeNull()
  })
  it('passes a tall narrow item stood on end', () => {
    const r = solveStep(door(80, 210), { length: 190, width: 60, height: 60 }, 0, 'low', { ups: ['end'], maxPitchDeg: 0 })
    expect(r.fits).toBe(true)
    expect(r.up).toBe('end')
  })
  it('turns a wardrobe in from a hallway', () => {
    expect(solveStep(door(80, 200, 100), { length: 60, width: 50, height: 180 }, 1, 'medium').fits).toBe(true)
  })
  it('hallway narrower than the item', () => {
    const r = solveStep(door(80, 200, 30), { length: 220, width: 95, height: 85 }, 1, 'medium')
    expect(r.fits).toBe(false)
    expect(r.margin).toBe(-MAX_MARGIN)
  })
  it('1 cm of clearance per side costs 1 cm of margin', () => {
    const item = { length: 180, width: 70, height: 70 }
    const a = solveStep(door(80, 200), item, 0, 'low').margin
    const b = solveStep(door(80, 200), item, 1, 'low').margin
    expect(a - b).toBeGreaterThan(0.9)
    expect(a - b).toBeLessThan(1.1)
  })
})

describe('tilt', () => {
  const item = { length: 200, width: 40, height: 40 }
  it('fails a narrow turn when kept flat', () => {
    expect(solveStep(turn(80, 80, 250), item, 0, 'low', flat2d).fits).toBe(false)
  })
  it('passes the same turn by tilting it up', () => {
    const r = solveStep(turn(80, 80, 250), item, 0, 'low', { ups: ['flat'] })
    expect(r.fits).toBe(true)
    expect(r.tilt).toBeGreaterThan(0)
  })
  it('stays stuck under a ceiling too low to tilt enough', () => {
    expect(solveStep(turn(80, 80, 150), item, 0, 'low', { ups: ['flat'] }).fits).toBe(false)
  })
})

describe('margin', () => {
  it('caps at +MAX_MARGIN for a tiny item and -MAX_MARGIN for a hopeless one', () => {
    expect(solveStep(door(80, 200), { length: 20, width: 20, height: 20 }, 0, 'low').margin).toBe(MAX_MARGIN)
    expect(solveStep(door(40, 200), { length: 200, width: 150, height: 150 }, 0, 'low').margin).toBe(-MAX_MARGIN)
  })
  it('is >= 0 exactly when it fits', () => {
    const cases = [
      solveStep(turn(100, 100, 260), { length: 150, width: 60, height: 50 }, 0, 'low'),
      solveStep(turn(80, 80, 150), { length: 200, width: 40, height: 40 }, 0, 'low'),
      solveStep(door(80, 200), { length: 180, width: 90, height: 90 }, 0, 'low'),
    ]
    for (const r of cases) expect(r.margin >= 0).toBe(r.fits)
  })
  it('points tightestIndex at a pose on the path', () => {
    const r = solveStep(turn(100, 100, 260), { length: 150, width: 60, height: 50 }, 0, 'low')
    expect(r.tightestIndex).toBeGreaterThanOrEqual(0)
    expect(r.tightestIndex).toBeLessThan(r.path.length)
  })
})

describe('huge items finish quickly', () => {
  it('gives up fast on a 20 m cube', () => {
    const t0 = performance.now()
    const r = solveStep(door(80, 200), { length: 2000, width: 2000, height: 2000 }, 1, 'medium')
    expect(r.fits).toBe(false)
    expect(performance.now() - t0).toBeLessThan(10000)
  })
  it('passes a 10 m beam straight through a door', () => {
    expect(solveStep(door(80, 200), { length: 1000, width: 50, height: 50 }, 1, 'medium').fits).toBe(true)
  })
})

describe('holdAt', () => {
  it('keeps the up side and tilt for modest tilts', () => {
    expect(holdAt('flat', 0)).toEqual({ up: 'flat', tilt: 0 })
    expect(holdAt('side', 30)).toEqual({ up: 'side', tilt: 30 })
  })
  it('calls a near-vertical tilt by the upright pose it really is', () => {
    expect(holdAt('flat', 90)).toEqual({ up: 'end', tilt: 0 })
    expect(holdAt('side', 80)).toEqual({ up: 'end', tilt: 0 })
    expect(holdAt('end', 90)).toEqual({ up: 'side', tilt: 0 })
  })
})

describe('equal margins', () => {
  it('prefers the orientation that needs no tilting', () => {
    // 92 × 87 cross-section through a 90 cm door: on its side (87 wide) fits untilted;
    // lying flat only fits by tilting up to vertical, for the same margin.
    const r = solveStep(door(90, 205), { length: 200, width: 90, height: 85 }, 1, 'low')
    expect(r.fits).toBe(true)
    expect(r.up).toBe('side')
    expect(r.tilt).toBe(0)
  })
})

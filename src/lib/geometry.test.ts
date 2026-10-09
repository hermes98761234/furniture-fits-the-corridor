import { describe, expect, it } from 'vitest'
import { hull2d, obbBounds, obbCorners, type Obb } from './geometry'

const box = (yawDeg = 0): Obb => {
  const a = (yawDeg * Math.PI) / 180
  return { c: [10, 20, 5], h: [4, 2, 1], axes: [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]] }
}

describe('obbCorners', () => {
  it('returns the 8 corners of an axis-aligned box', () => {
    const c = obbCorners(box())
    expect(c).toHaveLength(8)
    expect(c).toContainEqual([6, 18, 4])
    expect(c).toContainEqual([14, 22, 6])
  })
})

describe('obbBounds', () => {
  it('matches the box when axis-aligned', () => {
    expect(obbBounds(box())).toEqual({ min: [6, 18, 4], max: [14, 22, 6] })
  })
  it('swaps extents when rotated 90°', () => {
    const b = obbBounds(box(90))
    expect(b.min[0]).toBeCloseTo(8)
    expect(b.max[0]).toBeCloseTo(12)
    expect(b.min[1]).toBeCloseTo(16)
    expect(b.max[1]).toBeCloseTo(24)
  })
  it('covers every corner at 30°', () => {
    const o = box(30)
    const b = obbBounds(o)
    for (const p of obbCorners(o)) {
      for (let k = 0; k < 3; k++) {
        expect(p[k]).toBeGreaterThanOrEqual(b.min[k] - 1e-9)
        expect(p[k]).toBeLessThanOrEqual(b.max[k] + 1e-9)
      }
    }
  })
})

describe('hull2d', () => {
  it('drops interior and duplicate points', () => {
    const h = hull2d([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [0, 0]])
    expect(h).toHaveLength(4)
    expect(h).toEqual(expect.arrayContaining([[0, 0], [2, 0], [2, 2], [0, 2]]))
  })
})

import type { Aabb } from './geometry'
import type { Step } from './model'

const BIG = 10000

export type Scene = {
  obstacles: Aabb[]
  /** Range of box-centre positions to search. */
  bounds: { x: [number, number]; y: [number, number] }
  /**
   * Item is on the start line: its bounding box ends at or before `max` along `axis`
   * (0 = x, 1 = y). Cells further back are skipped. `side` additionally keeps the
   * start on the approach side of the other axis.
   */
  start: { axis: 0 | 1; max: number; side: number }
  /** Item is through: its bounding box begins at or after `min` along `axis`. */
  goal: { axis: 0 | 1; min: number }
}

/** Start line sits this far before the opening, so the item begins with room to spare. */
export const STANDOFF = 35

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Aabb => ({ min: [x0, y0, z0], max: [x1, y1, z1] })

/**
 * Obstacles for one step. The floor is z = 0 and is not an obstacle: the solver
 * always rests the box on it. `reach` is how far from an opening a box centre
 * must be for the box to be fully clear of it.
 */
export function buildScene(step: Step, reach: number): Scene {
  if (step.kind === 'turn') {
    // Entry runs along +x in y ∈ [0, a]; exit runs along +y in x ∈ [0, b]. Inner corner at (0, a).
    const a = step.entryWidth, b = step.exitWidth, c = step.ceiling
    return {
      obstacles: [
        box(-BIG, b + BIG, -BIG, 0, -BIG, BIG), // outer wall of the entry
        box(b, b + BIG, -BIG, BIG, -BIG, BIG), // outer wall of the exit
        box(-BIG, 0, a, BIG, -BIG, BIG), // inner corner block
        box(-BIG, BIG, -BIG, BIG, c, c + BIG), // ceiling
      ],
      bounds: { x: [-reach - STANDOFF, b], y: [0, a + reach] },
      start: { axis: 0, max: -STANDOFF, side: a },
      goal: { axis: 1, min: a },
    }
  }
  // Wall occupies y ∈ [0, t]; opening x ∈ [0, w], z ∈ [0, h]. Item goes from y < 0 to y > t.
  const { width: w, height: h, wallThickness: t, approachWidth: A } = step
  // ponytail: rooms either side assumed 250 cm tall (or the door height if taller); add a field if that bites
  const room = Math.max(h, 250)
  const obstacles = [
    box(-BIG, 0, 0, t, -BIG, BIG), // wall left of the opening
    box(w, BIG, 0, t, -BIG, BIG), // wall right of the opening
    box(0, w, 0, t, h, BIG), // above the opening
    box(-BIG, BIG, -BIG, BIG, room, room + BIG), // room ceiling
  ]
  if (A) obstacles.push(box(-BIG, BIG, -BIG, -A, -BIG, BIG)) // far wall of the approach hallway
  return {
    obstacles,
    bounds: A
      ? { x: [-reach - STANDOFF, w + reach], y: [-A, t + reach] }
      : { x: [-reach, w + reach], y: [-reach - STANDOFF, t + reach] },
    start: A ? { axis: 0, max: -STANDOFF, side: 0 } : { axis: 1, max: -STANDOFF, side: Infinity },
    goal: { axis: 1, min: t },
  }
}

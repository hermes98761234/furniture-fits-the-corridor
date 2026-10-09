import type { Obb, Vec3 } from './geometry'
import { buildScene, type Scene } from './scenes'
import type { Item, Quality, Step } from './model'

/** Which item dimension points up: smallest (flat), middle (side) or largest (end). */
export type Up = 'flat' | 'side' | 'end'
/** Box centre in plan (cm), yaw about vertical, pitch lifting the local x axis (radians). */
export type Pose = { x: number; y: number; yaw: number; pitch: number; up: Up }
export type StepResult = {
  fits: boolean
  /** cm the item could grow on every face (>= 0) or must shrink (< 0) to pass. */
  margin: number
  up: Up | null
  /** Largest tilt along the path, degrees. */
  tilt: number
  path: Pose[]
  tightestIndex: number
}
export type SolveOptions = { ups?: Up[]; maxPitchDeg?: number }

// ponytail: fixed grid is the accuracy limit (margin under-reads by up to ~one pos step); adaptive refinement near the tightest pose if that matters
export const QUALITY: Record<Quality, { pos: number; yawDeg: number; pitchDeg: number }> = {
  low: { pos: 4, yawDeg: 7.5, pitchDeg: 15 },
  medium: { pos: 3, yawDeg: 6, pitchDeg: 10 },
  high: { pos: 2, yawDeg: 5, pitchDeg: 7.5 },
}
/** Margins are reported within ±MAX_MARGIN cm, quantised to BUCKET cm while searching. */
export const MAX_MARGIN = 20
const BUCKET = 0.25
/** Search-only penalty (cm per degree of tilt) so ties go to the less tilted path. */
const TILT_COST = 0.01
/** Margins this close count as equal when choosing between orientations. */
const TIE = BUCKET
const NB = Math.round((2 * MAX_MARGIN) / BUCKET) + 1
/** Cap on (x, y) grid positions per search. */
const MAX_POSITIONS = 60_000

/** Local half extents [x, y, z]: z is the up dimension, x the longest remaining one (the one that tilts). */
export function localHalf(dims: Vec3, up: Up): Vec3 {
  const [s, m, l] = [...dims].sort((a, b) => a - b)
  const [x, y, z] = up === 'flat' ? [l, m, s] : up === 'side' ? [l, s, m] : [m, s, l]
  return [x / 2, y / 2, z / 2]
}

function axesOf(yaw: number, pitch: number): [Vec3, Vec3, Vec3] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  return [[cp * cy, cp * sy, sp], [-sy, cy, 0], [-sp * cy, -sp * sy, cp]]
}

/**
 * How to describe holding the item: tilting the long side (or, stood on end, the
 * middle side) to near vertical is really the upright pose, so name that instead.
 */
export function holdAt(up: Up, tiltDeg: number): { up: Up; tilt: number } {
  if (tiltDeg < 80) return { up, tilt: Math.round(tiltDeg) }
  return { up: up === 'end' ? 'side' : 'end', tilt: 0 }
}

export function poseToObb(half: Vec3, p: Pose): Obb {
  // Rest the lowest corner on the floor: lifting only wastes ceiling room.
  const z = half[0] * Math.sin(p.pitch) + half[2] * Math.cos(p.pitch)
  return { c: [p.x, p.y, z], h: half, axes: axesOf(p.yaw, p.pitch) }
}

/**
 * Per-orientation constants for the clearance test. For every unit SAT axis L:
 * the box's projected radius, how fast it grows per cm of inflation, and each
 * obstacle's projected radius and centre.
 */
type Orient = { ext: [number, number]; cz: number; lift: number; n: number; L: Float64Array; rA: Float64Array; k: Float64Array; rB: Float64Array; tB: Float64Array }

const WORLD: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

function orient(half: Vec3, yaw: number, pitch: number, scene: Scene): Orient {
  const ax = axesOf(yaw, pitch)
  // World axes first: they reject far-away obstacles cheapest.
  const cand: Vec3[] = [...WORLD, ...ax]
  for (const a of ax) for (const w of WORLD) cand.push([a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]])
  const axes = cand.filter((v) => Math.hypot(...v) > 1e-9).map((v) => v.map((c) => c / Math.hypot(...v)) as Vec3)
  const n = axes.length, m = scene.obstacles.length
  const L = new Float64Array(n * 3), rA = new Float64Array(n), k = new Float64Array(n)
  const rB = new Float64Array(n * m), tB = new Float64Array(n * m)
  axes.forEach((a, i) => {
    L.set(a, i * 3)
    const p = ax.map((e) => Math.abs(e[0] * a[0] + e[1] * a[1] + e[2] * a[2]))
    rA[i] = half[0] * p[0] + half[1] * p[1] + half[2] * p[2]
    k[i] = p[0] + p[1] + p[2]
    scene.obstacles.forEach((b, j) => {
      let r = 0, t = 0
      for (let d = 0; d < 3; d++) {
        r += ((b.max[d] - b.min[d]) / 2) * Math.abs(a[d])
        t += ((b.max[d] + b.min[d]) / 2) * a[d]
      }
      rB[i * m + j] = r
      tB[i * m + j] = t
    })
  })
  const sp = Math.sin(pitch), cp = Math.cos(pitch)
  const ext = [0, 1].map((d) => half[0] * Math.abs(ax[0][d]) + half[1] * Math.abs(ax[1][d]) + half[2] * Math.abs(ax[2][d])) as [number, number]
  return { ext, cz: half[0] * sp + half[2] * cp, lift: sp + cp, n, L, rA, k, rB, tB }
}

/**
 * How many cm the box could grow on every face at (x, y) and stay clear of every
 * obstacle; negative = how much it must shrink. Exact per SAT axis: growing by d
 * adds d·k to the projected radius and lifts the centre by d·lift (it stays on
 * the floor). Clamped to ±MAX_MARGIN.
 */
function clearance(o: Orient, x: number, y: number, m: number): number {
  let worst = MAX_MARGIN
  for (let j = 0; j < m && worst > -MAX_MARGIN; j++) {
    let best = -MAX_MARGIN
    for (let i = 0; i < o.n && best < worst; i++) {
      const lz = o.L[i * 3 + 2]
      const t = o.tB[i * m + j] - (x * o.L[i * 3] + y * o.L[i * 3 + 1] + o.cz * lz)
      const sign = t >= 0 ? 1 : -1
      const sep = sign * t - o.rA[i] - o.rB[i * m + j]
      const rate = o.k[i] + sign * o.lift * lz
      const d = rate > 1e-9 ? sep / rate : sep > 0 ? MAX_MARGIN : -MAX_MARGIN
      if (d > best) best = d
    }
    if (best < worst) worst = best
  }
  return worst
}

/**
 * Widest-path search over a 4D grid (x, y, yaw, pitch) for one `up` choice: the
 * start→goal route whose tightest pose has the most clearance. Popping cells in
 * decreasing-clearance order (bucket queue, FIFO within a bucket) means the first
 * visit is the best one. It starts from a one-cell-thick layer at the start line
 * and ignores cells behind it: the approach is open, so they add nothing.
 * ponytail: only grid poses are checked, not the sweep between neighbours; steps are small enough for furniture
 */
export function search(scene: Scene, half: Vec3, up: Up, quality: Quality, maxPitchDeg: number): { path: Pose[]; clear: number[] } | null {
  const q = QUALITY[quality]
  const [bx0, x1] = scene.bounds.x, [by0, y1] = scene.bounds.y
  // ponytail: very long items get a coarser position grid instead of running out of memory
  const pos = Math.max(q.pos, Math.sqrt(((x1 - bx0) * (y1 - by0)) / MAX_POSITIONS))
  // Snap the grid to whole multiples of the step so cell positions don't shift with item size.
  const x0 = Math.floor(bx0 / pos) * pos, y0 = Math.floor(by0 / pos) * pos
  const nx = Math.floor((x1 - x0) / pos) + 1
  const ny = Math.floor((y1 - y0) / pos) + 1
  const nw = Math.round(360 / q.yawDeg)
  const np = Math.floor(maxPitchDeg / q.pitchDeg + 1e-9) + 1
  const no = nw * np, nxy = nx * ny, m = scene.obstacles.length
  const yawStep = (2 * Math.PI) / nw, pitchStep = (q.pitchDeg * Math.PI) / 180
  const xs = Float64Array.from({ length: nx }, (_, i) => x0 + i * pos)
  const ys = Float64Array.from({ length: ny }, (_, i) => y0 + i * pos)
  // Orientation o = iw + ip * nw; cell index = ix + iy * nx + o * nxy.
  const orients: Orient[] = []
  for (let ip = 0; ip < np; ip++) for (let iw = 0; iw < nw; iw++) orients.push(orient(half, iw * yawStep, ip * pitchStep, scene))
  const { start, goal } = scene
  const startExt = Float64Array.from(orients, (o) => o.ext[start.axis])
  const sideExt = Float64Array.from(orients, (o) => o.ext[1 - start.axis])
  const goalExt = Float64Array.from(orients, (o) => o.ext[goal.axis])
  const lead = (ix: number, iy: number, o: number) => (start.axis === 0 ? xs[ix] : ys[iy]) + startExt[o]
  const tail = (ix: number, iy: number, o: number) => (goal.axis === 0 ? xs[ix] : ys[iy]) - goalExt[o]
  const behind = start.max - pos

  // 0 unseen, 1 behind the start line, 2..9 reached via direction (state - 2), 10 start
  const state = new Uint8Array(nxy * no)
  const buckets: number[][] = Array.from({ length: NB }, () => [])
  const heads = new Int32Array(NB)
  let top = -1
  const push = (i: number, ix: number, iy: number, o: number, s: number, limit: number) => {
    if (lead(ix, iy, o) <= behind) { state[i] = 1; return }
    state[i] = s
    const c = Math.min(limit, clearance(orients[o], xs[ix], ys[iy], m) - TILT_COST * Math.floor(o / nw) * q.pitchDeg)
    const b = Math.max(0, Math.floor((c + MAX_MARGIN) / BUCKET))
    buckets[b].push(i)
    if (b > top) top = b
  }
  // Start untilted (o < nw is pitch 0); the search tilts only where that buys clearance.
  for (let o = 0; o < nw; o++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const l = lead(ix, iy, o)
    const s = (start.axis === 0 ? ys[iy] : xs[ix]) + sideExt[o]
    if (l <= start.max && l > behind && s <= start.side) push(ix + iy * nx + o * nxy, ix, iy, o, 10, MAX_MARGIN)
  }

  const decode = (i: number) => {
    const ix = i % nx, r = (i - ix) / nx, iy = r % ny
    return [ix, iy, (r - iy) / ny] as const
  }
  const pose = (i: number): Pose => {
    const [ix, iy, o] = decode(i)
    return { x: xs[ix], y: ys[iy], yaw: (o % nw) * yawStep, pitch: Math.floor(o / nw) * pitchStep, up }
  }
  const clearOf = (i: number) => {
    const [ix, iy, o] = decode(i)
    return clearance(orients[o], xs[ix], ys[iy], m)
  }
  /** Neighbour along direction d (0 +x, 1 -x, 2 +y, 3 -y, 4 +yaw, 5 -yaw, 6 +pitch, 7 -pitch), or -1 off-grid. */
  const next = (i: number, d: number): number => {
    const [ix, iy, o] = decode(i)
    const iw = o % nw, ip = (o - iw) / nw
    switch (d) {
      case 0: return ix + 1 < nx ? i + 1 : -1
      case 1: return ix > 0 ? i - 1 : -1
      case 2: return iy + 1 < ny ? i + nx : -1
      case 3: return iy > 0 ? i - nx : -1
      case 4: return iw + 1 < nw ? i + nxy : i - (nw - 1) * nxy // yaw wraps
      case 5: return iw > 0 ? i - nxy : i + (nw - 1) * nxy
      case 6: return ip + 1 < np ? i + nw * nxy : -1
      default: return ip > 0 ? i - nw * nxy : -1
    }
  }

  // Bucket 0 holds poses at the -MAX_MARGIN floor: the answer is already "short by MAX_MARGIN or more".
  while (top > 0) {
    if (heads[top] === buckets[top].length) { top--; continue }
    const i = buckets[top][heads[top]++]
    const [ix, iy, o] = decode(i)
    if (tail(ix, iy, o) >= goal.min) {
      const cells: number[] = []
      for (let c = i; ; c = next(c, (state[c] - 2) ^ 1)) { // walk back opposite to the arrival direction
        cells.push(c)
        if (state[c] === 10) break
      }
      cells.reverse()
      return { path: cells.map(pose), clear: cells.map(clearOf) }
    }
    const limit = (top + 1) * BUCKET - MAX_MARGIN
    const iw = o % nw, ip = (o - iw) / nw
    const ow = iw + 1 < nw ? o + 1 : o - iw, owm = iw > 0 ? o - 1 : o + nw - 1
    let j: number
    if (ix + 1 < nx && state[(j = i + 1)] === 0) push(j, ix + 1, iy, o, 2, limit)
    if (ix > 0 && state[(j = i - 1)] === 0) push(j, ix - 1, iy, o, 3, limit)
    if (iy + 1 < ny && state[(j = i + nx)] === 0) push(j, ix, iy + 1, o, 4, limit)
    if (iy > 0 && state[(j = i - nx)] === 0) push(j, ix, iy - 1, o, 5, limit)
    if (state[(j = i + (ow - o) * nxy)] === 0) push(j, ix, iy, ow, 6, limit)
    if (state[(j = i + (owm - o) * nxy)] === 0) push(j, ix, iy, owm, 7, limit)
    if (ip + 1 < np && state[(j = i + nw * nxy)] === 0) push(j, ix, iy, o + nw, 8, limit)
    if (ip > 0 && state[(j = i - nw * nxy)] === 0) push(j, ix, iy, o - nw, 9, limit)
  }
  return null
}

export function solveStep(step: Step, item: Item, clearanceCm: number, quality: Quality, opts: SolveOptions = {}): StepResult {
  const g = 2 * clearanceCm
  const dims: Vec3 = [item.length + g, item.width + g, item.height + g]
  const scene = buildScene(step, Math.hypot(...dims) / 2 + 2)
  let best: { up: Up; path: Pose[]; clear: number[]; margin: number; tilt: number } | null = null
  for (const up of opts.ups ?? ['flat', 'side', 'end']) {
    const r = search(scene, localHalf(dims, up), up, quality, opts.maxPitchDeg ?? 90)
    if (!r) continue
    const margin = r.clear.reduce((a, b) => Math.min(a, b))
    const tilt = Math.round(r.path.reduce((a, p) => Math.max(a, (p.pitch * 180) / Math.PI), 0))
    // Equal margins (within a bucket) go to the orientation that needs less tilting: easier to carry.
    if (!best || margin > best.margin + TIE || (margin > best.margin - TIE && tilt < best.tilt)) best = { up, ...r, margin, tilt }
  }
  if (!best || best.margin < 0) return { fits: false, margin: best?.margin ?? -MAX_MARGIN, up: null, tilt: 0, path: [], tightestIndex: 0 }
  return {
    fits: true,
    margin: best.margin,
    up: best.up,
    tilt: best.tilt,
    path: best.path,
    tightestIndex: best.clear.indexOf(best.margin),
  }
}

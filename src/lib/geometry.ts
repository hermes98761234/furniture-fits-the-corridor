export type Vec3 = [number, number, number]
export type Aabb = { min: Vec3; max: Vec3 }
/** Oriented box: centre, half extents along its three unit axes. */
export type Obb = { c: Vec3; h: Vec3; axes: [Vec3, Vec3, Vec3] }

export function obbCorners(o: Obb): Vec3[] {
  const out: Vec3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p: Vec3 = [o.c[0], o.c[1], o.c[2]]
    for (let k = 0; k < 3; k++) p[k] += sx * o.h[0] * o.axes[0][k] + sy * o.h[1] * o.axes[1][k] + sz * o.h[2] * o.axes[2][k]
    out.push(p)
  }
  return out
}

/** World-axis bounding box of an oriented box. */
export function obbBounds(o: Obb): Aabb {
  const e = [0, 1, 2].map((k) => o.h[0] * Math.abs(o.axes[0][k]) + o.h[1] * Math.abs(o.axes[1][k]) + o.h[2] * Math.abs(o.axes[2][k]))
  return { min: [o.c[0] - e[0], o.c[1] - e[1], o.c[2] - e[2]], max: [o.c[0] + e[0], o.c[1] + e[1], o.c[2] + e[2]] }
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function hull2d(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: [number, number][]) => {
    const out: [number, number][] = []
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop()
      out.push(q)
    }
    return out.slice(0, -1)
  }
  return [...half(p), ...half([...p].reverse())]
}

import { useEffect, useRef, useState } from 'react'
import { buildScene } from '../lib/scenes'
import { localHalf, poseToObb, type Pose } from '../lib/solver'
import { hull2d, obbCorners, type Vec3 } from '../lib/geometry'
import type { Item, Step } from '../lib/model'
import type { StepStatus } from '../useSolver'
import type { T } from '../i18n'

type Props = { step: Step; item: Item; clearance: number; status: StepStatus | undefined; t: T }

const FRAME_MS = 60
/** Obstacles wider than this are the "infinite" ceiling slab, which plan view skips. */
const FINITE = 1000

/** world (u, v) → screen: x = ox + u·s, y = oy − v·s (v up). */
type View = { ox: number; oy: number; s: number }

function fit(u0: number, u1: number, v0: number, v1: number, left: number, top: number, w: number, h: number): View {
  const s = Math.min(w / (u1 - u0), h / (v1 - v0))
  return { s, ox: left + (w - (u1 - u0) * s) / 2 - u0 * s, oy: top + h - (h - (v1 - v0) * s) / 2 + v0 * s }
}

function draw(cv: HTMLCanvasElement, step: Step, half: Vec3, pose: Pose | null, tight: Pose | null, t: T) {
  const dpr = window.devicePixelRatio || 1
  const W = cv.clientWidth, H = cv.clientHeight
  if (!W || !H) return
  cv.width = Math.round(W * dpr)
  cv.height = Math.round(H * dpr)
  const g = cv.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const css = getComputedStyle(cv)
  const col = (name: string) => css.getPropertyValue(name).trim()
  g.fillStyle = col('--chart-bg')
  g.fillRect(0, 0, W, H)

  const scene = buildScene(step, Math.hypot(...half) + 2)
  const { bounds } = scene
  const top = step.kind === 'turn' ? step.ceiling : Math.max(step.height, 250)
  const sideAxis = step.kind === 'doorway' ? 1 : 0 // doorway: look along the wall; turn: along the entry
  const planH = Math.round(H * 0.6)
  const pad = 10, label = 16

  const rect = (v: View, u0: number, u1: number, v0: number, v1: number) =>
    g.rect(v.ox + u0 * v.s, v.oy - v1 * v.s, (u1 - u0) * v.s, (v1 - v0) * v.s)
  const shape = (v: View, p: Pose, a: number, b: number) => {
    const pts = hull2d(obbCorners(poseToObb(half, p)).map((c) => [c[a], c[b]] as [number, number]))
    g.beginPath()
    pts.forEach(([u, w], i) => (i ? g.lineTo(v.ox + u * v.s, v.oy - w * v.s) : g.moveTo(v.ox + u * v.s, v.oy - w * v.s)))
    g.closePath()
  }
  const item = (v: View, a: number, b: number) => {
    if (tight) {
      shape(v, tight, a, b)
      g.setLineDash([5, 4]); g.strokeStyle = col('--err'); g.lineWidth = 1.5; g.stroke(); g.setLineDash([])
    }
    if (pose) {
      shape(v, pose, a, b)
      g.globalAlpha = 0.35; g.fillStyle = col('--accent'); g.fill(); g.globalAlpha = 1
      g.strokeStyle = col('--accent'); g.lineWidth = 2; g.stroke()
    }
  }
  const caption = (text: string, y: number) => {
    g.fillStyle = col('--chart-fg'); g.font = '12px system-ui, sans-serif'; g.fillText(text, pad, y)
  }

  // Plan view: walls filled, the lintel dashed, the infinite ceiling skipped.
  const pv = fit(bounds.x[0], bounds.x[1], bounds.y[0], bounds.y[1], pad, pad + label, W - 2 * pad, planH - 2 * pad - label)
  g.save(); g.beginPath(); g.rect(0, 0, W, planH); g.clip()
  for (const o of scene.obstacles) {
    g.beginPath(); rect(pv, o.min[0], o.max[0], o.min[1], o.max[1])
    if (o.min[2] <= 0) {
      g.fillStyle = col('--grid-strong'); g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1
      g.strokeStyle = col('--grid-strong'); g.lineWidth = 1; g.stroke()
    } else if (o.max[0] - o.min[0] < FINITE) {
      g.setLineDash([4, 4]); g.strokeStyle = col('--ref-line'); g.stroke(); g.setLineDash([])
    }
  }
  item(pv, 0, 1)
  g.restore()
  caption(t('Plan'), pad + 10)

  // Side view: floor, ceiling and lintel along the side axis, with the item's silhouette.
  g.strokeStyle = col('--line'); g.beginPath(); g.moveTo(0, planH + 0.5); g.lineTo(W, planH + 0.5); g.stroke()
  const sv = fit(bounds[sideAxis === 0 ? 'x' : 'y'][0], bounds[sideAxis === 0 ? 'x' : 'y'][1], 0, top + 10, pad, planH + pad + label, W - 2 * pad, H - planH - 2 * pad - label)
  g.save(); g.beginPath(); g.rect(0, planH, W, H - planH); g.clip()
  for (const o of scene.obstacles) {
    if (o.min[2] <= 0) continue // walls run floor to ceiling; a side cut through the opening misses them
    g.beginPath(); rect(sv, o.min[sideAxis], o.max[sideAxis], o.min[2], Math.min(o.max[2], top + 1000))
    g.fillStyle = col('--panel2'); g.fill(); g.strokeStyle = col('--ref-line'); g.lineWidth = 1; g.stroke()
  }
  g.strokeStyle = col('--grid-strong'); g.lineWidth = 2
  g.beginPath(); g.moveTo(0, sv.oy); g.lineTo(W, sv.oy); g.stroke()
  item(sv, sideAxis, 2)
  g.restore()
  caption(t('Side'), planH + pad + 10)
}

export default function SceneView({ step, item, clearance, status, t }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const result = status?.state === 'done' ? status.result : null
  const path = result?.path ?? []
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [, setSize] = useState(0)
  const g2 = 2 * clearance
  const half = localHalf([item.length + g2, item.width + g2, item.height + g2], result?.up ?? 'flat')
  const pose = path.length ? path[Math.min(frame, path.length - 1)] : null
  const tight = result?.fits ? path[result.tightestIndex] : null

  useEffect(() => {
    if (!playing || path.length < 2) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % path.length), FRAME_MS)
    return () => window.clearInterval(id)
  }, [playing, path.length])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ro = new ResizeObserver(() => setSize(cv.clientWidth * 100000 + cv.clientHeight))
    ro.observe(cv)
    return () => ro.disconnect()
  }, [])

  // Redraw on every render: it is cheap, and it picks up theme and language changes.
  useEffect(() => {
    if (ref.current) draw(ref.current, step, half, pose, tight, t)
  })

  const message = !status || status.state === 'pending' ? t('Checking…') : result && !result.fits ? t("No path: it doesn't fit here.") : null
  return (
    <section className="box scene">
      <h3>{t('Walk-through')}</h3>
      <div className="scene-canvas">
        <canvas ref={ref} role="img" aria-label={t('Plan and side view of the selected step')} />
        {message && <div className="scene-msg">{message}</div>}
      </div>
      {result && path.length > 1 && (
        <div className="row">
          <button onClick={() => setPlaying(!playing)}>{playing ? t('Pause') : t('Play')}</button>
          <input type="range" min={0} max={path.length - 1} value={Math.min(frame, path.length - 1)} aria-label={t('Position along the path')}
            onChange={(e) => { setPlaying(false); setFrame(+e.target.value) }} />
          <button onClick={() => { setPlaying(false); setFrame(result.tightestIndex) }}>{t('Tightest point')}</button>
        </div>
      )}
    </section>
  )
}

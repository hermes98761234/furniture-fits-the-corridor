import { useEffect, useState } from 'react'
import type { AppState, Item, Quality, Step } from './lib/model'
import type { StepResult } from './lib/solver'

export type StepStatus = { state: 'pending' } | { state: 'done'; result: StepResult } | { state: 'error'; message: string } | { state: 'timeout' }
export type WorkerRequest = { item: Item; clearance: number; quality: Quality; step: Step }
export type WorkerResponse = { result: StepResult } | { error: string }

const TIMEOUT_MS: Record<Quality, number> = { low: 20_000, medium: 45_000, high: 120_000 }
const DEBOUNCE_MS = 300

/**
 * Solves every step in its own worker, so steps run in parallel. Any input change
 * terminates the running workers and starts over.
 * ponytail: one worker per step, no pool; add a pool if people build 10+ step routes
 */
export function useSolver(state: AppState, valid: boolean): Record<string, StepStatus> {
  // Results are tagged with the inputs they were solved for; a step with no result for the current inputs is pending.
  const [results, setResults] = useState<{ key: string; byStep: Record<string, StepStatus> }>({ key: '', byStep: {} })
  // Only what the solver reads: unit, language and theme changes must not re-solve.
  const key = JSON.stringify({ item: state.item, clearance: state.settings.clearance, quality: state.settings.quality, steps: state.steps })

  useEffect(() => {
    if (!valid) return
    const req = JSON.parse(key) as { item: Item; clearance: number; quality: Quality; steps: Step[] }
    const workers: Worker[] = []
    const timers: number[] = []
    const debounce = window.setTimeout(() => {
      for (const step of req.steps) {
        const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
        workers.push(w)
        const finish = (st: StepStatus) => {
          window.clearTimeout(timer)
          w.terminate()
          setResults((r) => ({ key, byStep: { ...(r.key === key ? r.byStep : {}), [step.id]: st } }))
        }
        const timer = window.setTimeout(() => finish({ state: 'timeout' }), TIMEOUT_MS[req.quality])
        timers.push(timer)
        w.onmessage = (e: MessageEvent<WorkerResponse>) =>
          finish('result' in e.data ? { state: 'done', result: e.data.result } : { state: 'error', message: e.data.error })
        w.onerror = (e) => finish({ state: 'error', message: e.message || 'worker failed' })
        const msg: WorkerRequest = { item: req.item, clearance: req.clearance, quality: req.quality, step }
        w.postMessage(msg)
      }
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(debounce)
      timers.forEach((t) => window.clearTimeout(t))
      workers.forEach((w) => w.terminate())
    }
  }, [key, valid])

  return results.key === key ? results.byStep : {}
}

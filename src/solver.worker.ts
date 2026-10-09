import { solveStep } from './lib/solver'
import type { WorkerRequest, WorkerResponse } from './useSolver'

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { item, clearance, quality, step } = e.data
  let msg: WorkerResponse
  try {
    msg = { result: solveStep(step, item, clearance, quality) }
  } catch (err) {
    msg = { error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(msg)
}

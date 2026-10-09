import { N } from './i18n'
import type { StepStatus } from './useSolver'

export type Verdict = { cls: '' | 'ok' | 'err' | 'warn'; text: string; args: number[] }

/** Overall route verdict from the per-step statuses (in route order). `text` is an i18n key with `{n}` args. */
export function verdict(statuses: (StepStatus | undefined)[], invalid: boolean): Verdict {
  const n = statuses.length
  if (invalid) return { cls: 'warn', text: N('Fix the highlighted fields.'), args: [] }
  if (n === 0) return { cls: '', text: N('Add a doorway or turn.'), args: [] }
  const blocked = statuses.filter((s) => s?.state === 'done' && !s.result.fits).length
  if (blocked > 0) return { cls: 'err', text: N("It won't fit: {0} of {1} steps blocked."), args: [blocked, n] }
  if (statuses.some((s) => !s || s.state === 'pending')) return { cls: '', text: N('Checking…'), args: [] }
  const unchecked = statuses.filter((s) => s?.state !== 'done').length
  if (unchecked > 0) return { cls: 'warn', text: N("Couldn't check {0} of {1} steps."), args: [unchecked, n] }
  return { cls: 'ok', text: N('It fits through the whole route.'), args: [] }
}

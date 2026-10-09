import { describe, expect, it } from 'vitest'
import { verdict } from './summary'
import type { StepStatus } from './useSolver'

const fits: StepStatus = { state: 'done', result: { fits: true, margin: 3, up: 'flat', tilt: 0, path: [], tightestIndex: 0 } }
const blocked: StepStatus = { state: 'done', result: { fits: false, margin: -3, up: null, tilt: 0, path: [], tightestIndex: 0 } }

describe('verdict', () => {
  it('asks to fix fields first', () => {
    expect(verdict([fits], true)).toEqual({ cls: 'warn', text: 'Fix the highlighted fields.', args: [] })
  })
  it('waits while any step is pending', () => {
    expect(verdict([fits, undefined], false).text).toBe('Checking…')
  })
  it('reports blocked steps even if another timed out', () => {
    expect(verdict([blocked, { state: 'timeout' }, fits], false)).toEqual({ cls: 'err', text: "It won't fit: {0} of {1} steps blocked.", args: [1, 3] })
  })
  it('finishes with a warning when steps timed out or failed', () => {
    expect(verdict([fits, { state: 'timeout' }, { state: 'error', message: 'x' }], false)).toEqual({ cls: 'warn', text: "Couldn't check {0} of {1} steps.", args: [2, 3] })
  })
  it('says it fits when every step fits', () => {
    expect(verdict([fits, fits], false).cls).toBe('ok')
  })
})

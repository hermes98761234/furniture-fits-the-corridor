import { toUnit, type Step, type Unit } from '../lib/model'
import { holdAt, MAX_MARGIN, type Up } from '../lib/solver'
import { N, STEP_LABEL, type T } from '../i18n'
import type { StepStatus } from '../useSolver'
import { verdict as summarize } from '../summary'

type Props = {
  steps: Step[]
  results: Record<string, StepStatus>
  unit: Unit
  invalid: boolean
  selected: string | null
  onSelect: (id: string) => void
  t: T
}

const UP_LABEL: Record<Up, string> = { flat: N('lying flat'), side: N('on its side'), end: N('stood on end') }

function describe(st: StepStatus | undefined, unit: Unit, t: T): { cls: string; icon: string; text: string } {
  if (!st || st.state === 'pending') return { cls: '', icon: '…', text: t('Checking…') }
  if (st.state === 'timeout') return { cls: 'warn-text', icon: '⏱', text: t('Timed out. Try a faster quality setting.') }
  if (st.state === 'error') return { cls: 'err-text', icon: '!', text: t('Error: {0}', st.message) }
  const r = st.result
  const m = `${Math.abs(toUnit(r.margin, unit)).toFixed(1)} ${t(unit)}`
  if (!r.fits) {
    return { cls: 'err-text', icon: '✗', text: r.margin <= -MAX_MARGIN ? t("Doesn't fit: short by {0} or more", m) : t("Doesn't fit: short by {0}", m) }
  }
  // Describe the hold at the tightest point: that's the moment that matters when carrying it.
  const hold = holdAt(r.up ?? 'flat', ((r.path[r.tightestIndex]?.pitch ?? 0) * 180) / Math.PI)
  const how = t(UP_LABEL[hold.up]) + (hold.tilt > 0 ? t(', tilted {0}°', hold.tilt) : '')
  const spare = r.margin >= MAX_MARGIN ? t('Fits with {0}+ to spare', m) : t('Fits with {0} to spare', m)
  return { cls: 'ok-text', icon: '✓', text: `${spare} · ${how}` }
}

export default function ResultPanel({ steps, results, unit, invalid, selected, onSelect, t }: Props) {
  const v = summarize(steps.map((s) => results[s.id]), invalid)
  const verdict = { cls: v.cls, text: t(v.text, ...v.args) }
  return (
    <section className="box">
      <h3>{t('Result')}</h3>
      <p className={`verdict ${verdict.cls}`} role="status">{verdict.text}</p>
      <table className="data">
        <tbody>
          {steps.map((s, i) => {
            const d = describe(results[s.id], unit, t)
            return (
              <tr key={s.id} className={s.id === selected ? 'active' : undefined}>
                <td><button className="link" onClick={() => onSelect(s.id)}>{i + 1}. {t(STEP_LABEL[s.kind])}</button></td>
                <td className={d.cls}><span aria-hidden="true">{d.icon}</span> {d.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

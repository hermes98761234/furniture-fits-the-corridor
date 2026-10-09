import { newDoorway, newTurn, type Step, type Unit } from '../lib/model'
import { N, STEP_LABEL, type T } from '../i18n'
import NumberField from './NumberField'

type Props = { steps: Step[]; unit: Unit; bad: Set<string>; t: T; onChange: (s: Step[]) => void }

const FIELDS = {
  doorway: [['width', N('Opening width')], ['height', N('Opening height')], ['wallThickness', N('Wall thickness')], ['approachWidth', N('Hallway width in front')]],
  turn: [['entryWidth', N('Corridor width before')], ['exitWidth', N('Corridor width after')], ['ceiling', N('Ceiling height')]],
} as const

export default function RouteEditor({ steps, unit, bad, t, onChange }: Props) {
  const replace = (i: number, s: Step) => onChange(steps.map((x, j) => (j === i ? s : x)))
  const move = (i: number, d: -1 | 1) => {
    const s = [...steps]
    ;[s[i], s[i + d]] = [s[i + d], s[i]]
    onChange(s)
  }
  return (
    <section className="section">
      <h3>{t('Route')}</h3>
      {steps.length === 0 && <p className="hint">{t('Add a doorway or turn.')}</p>}
      {steps.map((s, i) => (
        <div className="card" key={s.id}>
          <div className="row">
            <strong>{i + 1}. {t(STEP_LABEL[s.kind])}</strong>
            <span className="spacer" />
            <button className="small" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="small" aria-label={t('Move down')} title={t('Move down')} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="small danger" aria-label={t('Remove')} title={t('Remove')} onClick={() => onChange(steps.filter((x) => x.id !== s.id))}>✕</button>
          </div>
          <div className="grid2">
            {FIELDS[s.kind].map(([k, label]) => (
              <NumberField
                key={k}
                label={`${t(label)}, ${t(unit)}`}
                cm={(s as unknown as Record<string, number | undefined>)[k]}
                unit={unit}
                bad={bad.has(`${s.id}.${k}`)}
                optional={k === 'approachWidth'}
                placeholder={k === 'approachWidth' ? t('open space') : undefined}
                onChange={(v) => replace(i, { ...s, [k]: v } as Step)}
              />
            ))}
          </div>
          {s.kind === 'doorway' && (
            <p className="hint">{t('Leave the hallway empty if you come from a room. Fill it in if you come along a hallway that runs past the door.')}</p>
          )}
        </div>
      ))}
      <div className="row">
        <button onClick={() => onChange([...steps, newDoorway()])}>+ {t('Doorway')}</button>
        <button onClick={() => onChange([...steps, newTurn()])}>+ {t('Corridor turn')}</button>
      </div>
    </section>
  )
}

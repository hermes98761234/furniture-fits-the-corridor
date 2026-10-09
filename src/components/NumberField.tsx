import { useState } from 'react'
import { fromUnit, toUnit, type Unit } from '../lib/model'

type Props = {
  label: string
  cm: number | undefined
  unit: Unit
  bad: boolean
  optional?: boolean
  placeholder?: string
  onChange: (cm: number | undefined) => void
}

/**
 * A length shown in the chosen unit and stored in cm. While focused it keeps the
 * raw text, so typing "8" on the way to "80" isn't reformatted. An empty optional
 * field gives undefined; anything unparsable gives NaN, which validation flags.
 */
export default function NumberField({ label, cm, unit, bad, optional, placeholder, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = cm === undefined || !Number.isFinite(cm) ? '' : String(+toUnit(cm, unit).toFixed(2))
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={bad ? 'bad' : undefined}
        aria-invalid={bad}
        placeholder={placeholder}
        value={draft ?? shown}
        onChange={(e) => {
          const v = e.target.value.trim()
          setDraft(e.target.value)
          onChange(v === '' ? (optional ? undefined : NaN) : fromUnit(Number(v), unit))
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

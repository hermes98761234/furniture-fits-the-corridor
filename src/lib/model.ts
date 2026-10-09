export type Unit = 'cm' | 'in'
export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type Quality = 'low' | 'medium' | 'high'
export type Item = { length: number; width: number; height: number }
export type Settings = { clearance: number; unit: Unit; lang: Lang; quality: Quality; theme: Theme }
/** `approachWidth`: width of a hallway running past the door on the approach side; undefined = open room. */
export type DoorwayStep = { id: string; kind: 'doorway'; width: number; height: number; wallThickness: number; approachWidth?: number }
export type TurnStep = { id: string; kind: 'turn'; entryWidth: number; exitWidth: number; ceiling: number }
export type Step = DoorwayStep | TurnStep
export type AppState = { item: Item; settings: Settings; steps: Step[] }

/** All lengths are cm; inches are display-only. */
export const CM_PER_IN = 2.54
export const MAX_LEN = 2000
export const MAX_CLEARANCE = 20

export const toUnit = (cm: number, u: Unit) => (u === 'in' ? cm / CM_PER_IN : cm)
export const fromUnit = (v: number, u: Unit) => (u === 'in' ? v * CM_PER_IN : v)

const validLen = (v: number | undefined) => v !== undefined && Number.isFinite(v) && v > 0 && v <= MAX_LEN

export const newId = () => Math.random().toString(36).slice(2, 10)
export const newDoorway = (): DoorwayStep => ({ id: newId(), kind: 'doorway', width: 80, height: 200, wallThickness: 12 })
export const newTurn = (): TurnStep => ({ id: newId(), kind: 'turn', entryWidth: 100, exitWidth: 100, ceiling: 260 })

/** A typical move: front door, a hallway turn, then a bedroom door off that hallway. */
export const DEFAULT_STATE: AppState = {
  item: { length: 200, width: 90, height: 85 },
  settings: { clearance: 1, unit: 'cm', lang: 'en', quality: 'medium', theme: 'auto' },
  steps: [
    { id: 'front-door', kind: 'doorway', width: 90, height: 205, wallThickness: 15 },
    { id: 'hall-turn', kind: 'turn', entryWidth: 110, exitWidth: 100, ceiling: 260 },
    { id: 'room-door', kind: 'doorway', width: 80, height: 200, wallThickness: 12, approachWidth: 100 },
  ],
}

const STEP_FIELDS = {
  doorway: ['width', 'height', 'wallThickness'],
  turn: ['entryWidth', 'exitWidth', 'ceiling'],
} as const

/** Field keys that fail validation: `item.length`, `settings.clearance`, `<stepId>.<field>`. */
export function invalidFields(s: AppState): Set<string> {
  const bad = new Set<string>()
  for (const k of ['length', 'width', 'height'] as const) if (!validLen(s.item[k])) bad.add(`item.${k}`)
  const c = s.settings.clearance
  if (!(Number.isFinite(c) && c >= 0 && c <= MAX_CLEARANCE)) bad.add('settings.clearance')
  for (const st of s.steps) {
    const rec = st as unknown as Record<string, number | undefined>
    for (const f of STEP_FIELDS[st.kind]) if (!validLen(rec[f])) bad.add(`${st.id}.${f}`)
    if (st.kind === 'doorway' && st.approachWidth !== undefined && !validLen(st.approachWidth)) bad.add(`${st.id}.approachWidth`)
  }
  return bad
}

const KEY = 'fftc:v1'

const oneOf = <V extends string>(v: unknown, allowed: readonly V[], fallback: V): V => (allowed.includes(v as V) ? (v as V) : fallback)
const isStep = (x: unknown): x is Step =>
  typeof x === 'object' && x !== null && typeof (x as Step).id === 'string' && ((x as Step).kind === 'doorway' || (x as Step).kind === 'turn')

export function loadState(): AppState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s && typeof s.item === 'object' && s.item && typeof s.settings === 'object' && s.settings && Array.isArray(s.steps)) {
      // Saved data may come from an older version or be hand-edited: keep only what we understand.
      const d = DEFAULT_STATE.settings, st = s.settings
      return {
        item: { ...DEFAULT_STATE.item, ...s.item },
        settings: {
          clearance: typeof st.clearance === 'number' ? st.clearance : d.clearance,
          unit: oneOf(st.unit, ['cm', 'in'], d.unit),
          lang: oneOf(st.lang, ['en', 'uk'], d.lang),
          quality: oneOf(st.quality, ['low', 'medium', 'high'], d.quality),
          theme: oneOf(st.theme, ['auto', 'light', 'dark'], d.theme),
        },
        steps: s.steps.filter(isStep),
      }
    }
  } catch {
    // Storage blocked, missing or corrupt: fall back to the defaults below.
  }
  // English by default; a language the user picks is remembered above.
  return structuredClone(DEFAULT_STATE)
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Private mode or quota: the app still works, it just won't remember.
  }
}

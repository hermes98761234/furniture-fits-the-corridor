import { useEffect, useMemo, useState } from 'react'
import { invalidFields, loadState, saveState, type AppState } from './lib/model'
import { tr, type T } from './i18n'
import { useSolver } from './useSolver'
import ItemForm from './components/ItemForm'
import RouteEditor from './components/RouteEditor'
import ResultPanel from './components/ResultPanel'
import SceneView from './components/SceneView'

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [selected, setSelected] = useState<string | null>(null)
  const { item, settings, steps } = state
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const bad = useMemo(() => invalidFields(state), [state])
  const results = useSolver(state, bad.size === 0 && steps.length > 0)
  const update = (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch }))

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])

  const sel = steps.find((s) => s.id === selected) ?? steps[0]

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Furniture fits the corridor')}</span>
        <span className="hint">{t('Will it get through? A 3D check for doorways and corridor turns.')}</span>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <ItemForm item={item} settings={settings} bad={bad} t={t} onItem={(i) => update({ item: i })} onSettings={(s) => update({ settings: s })} />
            <RouteEditor steps={steps} unit={settings.unit} bad={bad} t={t} onChange={(s) => update({ steps: s })} />
          </div>
        </aside>
        <main className="main">
          <ResultPanel steps={steps} results={results} unit={settings.unit} invalid={bad.size > 0} selected={sel?.id ?? null} onSelect={setSelected} t={t} />
          {sel && (
            <SceneView key={`${sel.id}:${results[sel.id]?.state}`} step={sel} item={item} clearance={settings.clearance} status={results[sel.id]} t={t} />
          )}
        </main>
      </div>
      <p className="hint foot">
        {t('Results are estimates on a grid. Leave a little extra room.')}{' '}
        <a href="https://github.com/hermes98761234/furniture-fits-the-corridor">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}

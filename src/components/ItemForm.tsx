import type { Item, Lang, Quality, Settings, Theme, Unit } from '../lib/model'
import { N, type T } from '../i18n'
import NumberField from './NumberField'

type Props = { item: Item; settings: Settings; bad: Set<string>; t: T; onItem: (i: Item) => void; onSettings: (s: Settings) => void }

const DIMS = [['length', N('Length')], ['width', N('Width')], ['height', N('Height')]] as const

export default function ItemForm({ item, settings, bad, t, onItem, onSettings }: Props) {
  const u = settings.unit
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onSettings({ ...settings, [k]: v })
  return (
    <>
      <section className="section">
        <h3>{t('Item')}</h3>
        <div className="grid3">
          {DIMS.map(([k, label]) => (
            <NumberField key={k} label={`${t(label)}, ${t(u)}`} cm={item[k]} unit={u} bad={bad.has(`item.${k}`)}
              onChange={(v) => onItem({ ...item, [k]: v ?? NaN })} />
          ))}
        </div>
        <NumberField label={`${t('Clearance per side')}, ${t(u)}`} cm={settings.clearance} unit={u} bad={bad.has('settings.clearance')}
          onChange={(v) => set('clearance', v ?? NaN)} />
        <p className="hint">{t('Added to every side for wrapping and hands.')}</p>
      </section>
      <section className="section">
        <h3>{t('Settings')}</h3>
        <div className="grid2">
          <label className="field">
            <span>{t('Units')}</span>
            <select value={u} onChange={(e) => set('unit', e.target.value as Unit)}>
              <option value="cm">{t('Centimetres')}</option>
              <option value="in">{t('Inches')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('Quality')}</span>
            <select value={settings.quality} onChange={(e) => set('quality', e.target.value as Quality)}>
              <option value="low">{t('Fast')}</option>
              <option value="medium">{t('Balanced')}</option>
              <option value="high">{t('Precise')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('Language')}</span>
            <select value={settings.lang} onChange={(e) => set('lang', e.target.value as Lang)}>
              <option value="en">English</option>
              <option value="uk">Українська</option>
            </select>
          </label>
          <label className="field">
            <span>{t('Theme')}</span>
            <select value={settings.theme} onChange={(e) => set('theme', e.target.value as Theme)}>
              <option value="auto">{t('System')}</option>
              <option value="light">{t('Light')}</option>
              <option value="dark">{t('Dark')}</option>
            </select>
          </label>
        </div>
      </section>
    </>
  )
}

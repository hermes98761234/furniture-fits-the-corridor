# Furniture Fits the Corridor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app that checks, in 3D, whether a box-shaped piece of furniture gets through a route of doorways and 90° corridor turns. It reports the margin and the working orientation, and animates a walk-through. It deploys to GitHub Pages from a new public repo with CI.

**Architecture:** A React 19 + Vite + TypeScript single-page app, styled with WebVNA's CSS token sheet. A pure solver in `src/lib/` runs a widest-path search over a 4D pose grid (x, y, yaw, pitch) for each "up" orientation, with a closed-form clearance per pose. Each route step is solved in its own Web Worker. State is plain React state persisted to localStorage.

**Tech Stack:** React 19, Vite 8, TypeScript 6, Vitest 5, oxlint, headless Chromium (only for rendering PNG icons and the README screenshot), GitHub Actions, GitHub Pages, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-09-furniture-fits-the-corridor-design.md`

## Global Constraints

- Node 22 (CI uses `node-version: 22`). The local machine is aarch64 Linux with Node v22.22 and Chromium at `/usr/bin/chromium`.
- Runtime dependencies: `react` and `react-dom` only. No state library, no UI kit, no CSS framework.
- All lengths are stored and computed in **cm**. Inches are display-only (`1 in = 2.54 cm`).
- Languages: English (source strings are the keys) and Ukrainian (the `UK` dictionary in `src/i18n.ts`). Every user-visible string goes through `t('…')`, or `N('…')` for strings defined away from the call.
- Colours come only from CSS custom properties (`--bg`, `--panel`, `--panel2`, `--fg`, `--muted`, `--line`, `--accent`, `--accent-fg`, `--ok`, `--warn`, `--err`, `--chart-bg`, `--grid`, `--grid-strong`, `--chart-fg`, `--ref-line`) copied from WebVNA. Themes: system, `[data-theme="light"]` and `[data-theme="dark"]`.
- Phone width: a 16 px side gutter and no horizontal scroll at 360 px.
- Repo: `hermes98761234/furniture-fits-the-corridor`, public, MIT, branch `main`. Live URL: `https://hermes98761234.github.io/furniture-fits-the-corridor/`.
- Vite `base: './'`, so the build works under the Pages sub-path.
- Field limits: lengths satisfy 0 < v ≤ 2000 cm. Clearance satisfies 0 ≤ v ≤ 20 cm.
- Solver constants (from the spec): `MAX_MARGIN = 20` cm, `STANDOFF = 35` cm, quality presets low `{pos 4, yaw 7.5°, pitch 15°}`, medium `{3, 6°, 10°}` (the default), high `{2, 5°, 7.5°}`. Worker timeouts are 20 s, 45 s and 120 s.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK
  ```

## Review Focus

1. **Huge items (up to the 2000 cm field limit)** must not run the browser out of memory or hang. The solver caps the (x, y) grid at 60k positions and stops at the −20 cm floor. Expected: a quick "short by 20 cm or more". Test: Task 4, `huge items finish quickly`.
2. **Corrupt or foreign localStorage data** (bad JSON, or the wrong shape from an old version) must not crash the app on load. Expected: defaults. Test: Task 2, `loadState ignores corrupt storage`.
3. **Inch round-trip.** Typing 31.5 in and switching units back and forth must not drift. Expected: 31.5 is displayed again. Test: Task 2, `round-trips a typed inch value`.
4. **An approach hallway narrower than the item** gives no valid start poses at all. Expected: fits = false with margin −20, not a crash or hang. Test: Task 4, `hallway narrower than the item`.
5. **Untranslated strings.** A new `t('…')` literal without a Ukrainian entry would show English mid-sentence in Ukrainian mode. Test: Task 5 scans `src/` for `t(`/`N(` literals, and is re-run in Tasks 6–7.

---

## File Structure

```
package.json, package-lock.json, tsconfig*.json, vite.config.ts, .oxlintrc.json, .gitignore, LICENSE, README.md
index.html                       page shell + SEO/OG meta (Task 1 minimal, Task 8 final)
public/                          favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png,
                                 manifest.webmanifest, robots.txt, sitemap.xml (Task 8)
scripts/render-images.sh         headless-Chromium PNG renderer (Task 8)
scripts/icon.html, scripts/og.html  render sources (Task 8)
docs/screenshot.png              README screenshot (Task 9)
.github/workflows/ci.yml, deploy.yml (Task 9)
src/main.tsx                     React entry
src/index.css                    WebVNA tokens + app layout
src/App.tsx                      state, persistence, theme, layout
src/i18n.ts                      tr(), N(), STEP_LABEL, UK dictionary
src/useSolver.ts                 one worker per step, debounce, timeouts; StepStatus type
src/solver.worker.ts             runs solveStep
src/components/NumberField.tsx   length input in cm/in
src/components/ItemForm.tsx      item dims, clearance, settings
src/components/RouteEditor.tsx   step cards
src/components/ResultPanel.tsx   verdict + per-step rows
src/components/SceneView.tsx     canvas plan/side view + animation
src/lib/model.ts                 types, defaults, units, validation, storage
src/lib/geometry.ts              Vec3/Aabb/Obb, corners, bounds, hull
src/lib/scenes.ts                step → obstacles, bounds, start/goal
src/lib/solver.ts                clearance + widest-path search + solveStep
src/lib/*.test.ts, src/i18n.test.ts
```

---

### Task 1: Scaffold with WebVNA styles

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.test.json`, `vite.config.ts`, `.oxlintrc.json`, `.gitignore`, `LICENSE`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

**Interfaces:**
- Produces: `npm run dev|build|lint|test|typecheck` scripts. The CSS classes used by later tasks: `.app .toolbar .brand .body .side .panel .section .row .spacer .grid2 .grid3 .field .hint .err-text .ok-text .warn-text .card .main .box .verdict(.ok/.err/.warn) table.data tr.active .scene .scene-canvas .scene-msg .foot button.small button.danger button.link input.bad`.

- [ ] **Step 1: Write the config files**

`package.json`:
```json
{
  "name": "furniture-fits-the-corridor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vitest": "^5.0.3"
  }
}
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.test.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

`tsconfig.test.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client", "node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.test.ts"]
}
```

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the build works from any sub-path (GitHub Pages).
  base: './',
  test: {
    // Solver tests run real searches.
    testTimeout: 60000,
  },
})
```

`.oxlintrc.json`:
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

`.gitignore`:
```
node_modules
dist
*.local
*.log
*.tsbuildinfo
.DS_Store
.vscode/*
.idea
.claude/settings.local.json
```

`LICENSE`: the standard MIT license text, with the line `Copyright (c) 2026 Volodymyr Kopytsia`.

- [ ] **Step 2: Write the page shell and entry**

`index.html` (minimal; Task 8 replaces it):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>Furniture Fits the Corridor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx` (placeholder; Task 6 replaces it):
```tsx
export default function App() {
  return (
    <div className="app">
      <header className="toolbar"><span className="brand">Furniture fits the corridor</span></header>
    </div>
  )
}
```

- [ ] **Step 3: Write `src/index.css`**

The token blocks are copied verbatim from WebVNA's `src/index.css`. The rest is this app's layout, written in WebVNA's idiom.

```css
:root {
  --bg: #f4f5f7;
  --panel: #ffffff;
  --panel2: #eef0f3;
  --fg: #1d2129;
  --muted: #5f6673;
  --line: #d6d9df;
  --accent: #2563eb;
  --accent-fg: #ffffff;
  --ok: #15803d;
  --warn: #b45309;
  --err: #b91c1c;
  --chart-bg: #ffffff;
  --grid: #e3e6ea;
  --grid-strong: #b9bec7;
  --chart-fg: #4a5160;
  --ref-line: #d97706;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: var(--fg);
  background: var(--bg);
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1115;
    --panel: #171a21;
    --panel2: #1f232c;
    --fg: #e6e8ec;
    --muted: #9aa1ad;
    --line: #2c313c;
    --accent: #3b82f6;
    --ok: #4ade80;
    --warn: #fbbf24;
    --err: #f87171;
    --chart-bg: #0b0d11;
    --grid: #1f242d;
    --grid-strong: #3a414e;
    --chart-fg: #a3aab6;
    --ref-line: #f59e0b;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0f1115;
  --panel: #171a21;
  --panel2: #1f232c;
  --fg: #e6e8ec;
  --muted: #9aa1ad;
  --line: #2c313c;
  --accent: #3b82f6;
  --ok: #4ade80;
  --warn: #fbbf24;
  --err: #f87171;
  --chart-bg: #0b0d11;
  --grid: #1f242d;
  --grid-strong: #3a414e;
  --chart-fg: #a3aab6;
  --ref-line: #f59e0b;
  color-scheme: dark;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); }

button, select, input { font: inherit; color: inherit; }
button {
  background: var(--panel2); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; cursor: pointer;
  white-space: nowrap;
}
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.45; cursor: default; }
button.danger { color: var(--err); }
button.small { padding: 2px 7px; font-size: 12px; }
button.link { background: none; border: none; padding: 0; text-align: left; white-space: normal; }
select, input[type="number"] {
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; min-width: 0;
}
input.bad { border-color: var(--err); }
input[type="range"] { accent-color: var(--accent); }
label { color: var(--muted); font-size: 12px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
a { color: var(--accent); }

.app { display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh; }
.toolbar {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line);
}
.toolbar .brand { font-weight: 700; font-size: 16px; }
.body { display: grid; grid-template-columns: 360px minmax(0, 1fr); }
.side { background: var(--panel); border-right: 1px solid var(--line); }
.panel { padding: 10px 12px; }
.section { margin-bottom: 14px; }
.section h3, .box h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 6px; }
.row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.spacer { flex: 1; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 6px; }
.field { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-bottom: 6px; }
.field input, .field select { width: 100%; color: var(--fg); font-size: 14px; }
.hint { color: var(--muted); font-size: 12px; line-height: 1.4; margin: 0 0 6px; }
.err-text { color: var(--err); }
.ok-text { color: var(--ok); }
.warn-text { color: var(--warn); }
.card { border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin-bottom: 8px; background: var(--panel); }

.main { display: flex; flex-direction: column; gap: 8px; padding: 8px; min-width: 0; }
.box { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px; min-width: 0; }
.verdict { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
.verdict.ok { color: var(--ok); }
.verdict.err { color: var(--err); }
.verdict.warn { color: var(--warn); }
table.data { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
table.data td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.data td:first-child { white-space: nowrap; }
table.data tr.active td { background: var(--panel2); }

.scene-canvas {
  position: relative; height: 460px; background: var(--chart-bg); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin-bottom: 6px;
}
.scene-canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.scene-msg { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); pointer-events: none; }
.scene .row input[type="range"] { flex: 1; min-width: 120px; }
.foot { padding: 8px 12px; border-top: 1px solid var(--line); margin: 0; }

/* Phones: one column, 16px gutter, bigger touch targets; 16px inputs stop iOS from zooming on focus. */
@media (max-width: 800px) {
  .body { grid-template-columns: minmax(0, 1fr); }
  .side { border-right: none; border-bottom: 1px solid var(--line); }
  .panel, .main, .toolbar, .foot { padding-left: 16px; padding-right: 16px; }
  .scene-canvas { height: 380px; }
  button { min-height: 36px; }
  button.small { min-height: 30px; padding: 4px 9px; }
  button.link { min-height: 0; }
  input[type="number"], select { font-size: 16px; min-height: 36px; }
}
@media (max-width: 420px) {
  .grid3 { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 4: Install and verify the toolchain**

Run: `npm install && npm run build && npm run lint`
Expected: the install succeeds, `dist/index.html` exists, and lint shows 0 errors.

If `npm install` rejects a version (for example, a version not yet published for this platform), drop to the newest version that `npm view <pkg> version` reports and keep the same major.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React app with WebVNA styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 2: Model — types, defaults, units, validation, storage

**Files:**
- Create: `src/lib/model.ts`
- Test: `src/lib/model.test.ts`

**Interfaces:**
- Produces:
  - Types: `Unit = 'cm'|'in'`, `Lang = 'en'|'uk'`, `Theme = 'auto'|'light'|'dark'`, `Quality = 'low'|'medium'|'high'`, `Item = {length,width,height}`, `Settings = {clearance, unit, lang, quality, theme}`, `DoorwayStep = {id, kind:'doorway', width, height, wallThickness, approachWidth?}`, `TurnStep = {id, kind:'turn', entryWidth, exitWidth, ceiling}`, `Step`, `AppState = {item, settings, steps}`.
  - Functions: `toUnit(cm, unit): number`, `fromUnit(v, unit): number`, `invalidFields(state): Set<string>` (keys `item.<k>`, `settings.clearance`, `<stepId>.<field>`), `newDoorway(): DoorwayStep`, `newTurn(): TurnStep`, `loadState(): AppState`, `saveState(state): void`.
  - Constants: `DEFAULT_STATE`, `MAX_LEN = 2000`, `MAX_CLEARANCE = 20`.

- [ ] **Step 1: Write the failing tests**

`src/lib/model.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATE, fromUnit, invalidFields, loadState, saveState, toUnit } from './model'

afterEach(() => vi.unstubAllGlobals())

describe('units', () => {
  it('converts inches both ways and leaves cm alone', () => {
    expect(toUnit(254, 'in')).toBeCloseTo(100)
    expect(fromUnit(100, 'in')).toBeCloseTo(254)
    expect(toUnit(80, 'cm')).toBe(80)
    expect(fromUnit(80, 'cm')).toBe(80)
  })
  it('round-trips a typed inch value', () => {
    expect(+toUnit(fromUnit(31.5, 'in'), 'in').toFixed(2)).toBe(31.5)
  })
})

describe('invalidFields', () => {
  it('accepts the defaults', () => {
    expect(invalidFields(DEFAULT_STATE).size).toBe(0)
  })
  it('flags zero, NaN and over-limit lengths by field', () => {
    const s = structuredClone(DEFAULT_STATE)
    s.item.length = 0
    s.item.width = NaN
    s.item.height = 5000
    expect([...invalidFields(s)].sort()).toEqual(['item.height', 'item.length', 'item.width'])
  })
  it('allows zero clearance but not negative or over 20 cm', () => {
    const s = structuredClone(DEFAULT_STATE)
    s.settings.clearance = 0
    expect(invalidFields(s).size).toBe(0)
    s.settings.clearance = -1
    expect(invalidFields(s).has('settings.clearance')).toBe(true)
    s.settings.clearance = 21
    expect(invalidFields(s).has('settings.clearance')).toBe(true)
  })
  it('treats an empty hallway width as open space but flags a bad one', () => {
    const s = structuredClone(DEFAULT_STATE)
    const d = s.steps[0]
    if (d.kind !== 'doorway') throw new Error('default route starts with a doorway')
    d.approachWidth = undefined
    expect(invalidFields(s).size).toBe(0)
    d.approachWidth = -5
    expect(invalidFields(s).has(`${d.id}.approachWidth`)).toBe(true)
  })
  it('flags bad step fields with the step id', () => {
    const s = structuredClone(DEFAULT_STATE)
    const t = s.steps[1]
    if (t.kind !== 'turn') throw new Error('default route has a turn second')
    t.ceiling = NaN
    expect([...invalidFields(s)]).toEqual([`${t.id}.ceiling`])
  })
})

describe('storage', () => {
  const fakeStorage = (initial: string | null) => {
    let v = initial
    return { getItem: () => v, setItem: (_: string, x: string) => { v = x } }
  }
  it('falls back to defaults without storage', () => {
    expect(loadState().item).toEqual(DEFAULT_STATE.item)
  })
  it('loadState ignores corrupt storage', () => {
    vi.stubGlobal('localStorage', fakeStorage('{not json'))
    expect(loadState().steps).toEqual(DEFAULT_STATE.steps)
    vi.stubGlobal('localStorage', fakeStorage('{"item":1,"settings":null,"steps":"x"}'))
    expect(loadState().item).toEqual(DEFAULT_STATE.item)
  })
  it('round-trips through saveState', () => {
    vi.stubGlobal('localStorage', fakeStorage(null))
    const s = structuredClone(DEFAULT_STATE)
    s.item.length = 123
    s.settings.unit = 'in'
    saveState(s)
    const back = loadState()
    expect(back.item.length).toBe(123)
    expect(back.settings.unit).toBe('in')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/model.test.ts`
Expected: FAIL with "Failed to resolve import './model'".

- [ ] **Step 3: Implement `src/lib/model.ts`**

```ts
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

export function loadState(): AppState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s && typeof s.item === 'object' && s.item && typeof s.settings === 'object' && s.settings && Array.isArray(s.steps)) {
      return { item: { ...DEFAULT_STATE.item, ...s.item }, settings: { ...DEFAULT_STATE.settings, ...s.settings }, steps: s.steps }
    }
  } catch {
    // Storage blocked, missing or corrupt: fall back to the defaults below.
  }
  const lang: Lang = globalThis.navigator?.language?.startsWith('uk') ? 'uk' : 'en'
  return { ...structuredClone(DEFAULT_STATE), settings: { ...DEFAULT_STATE.settings, lang } }
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Private mode or quota: the app still works, it just won't remember.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/model.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model.ts src/lib/model.test.ts
git commit -m "feat: model types, units, validation and storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 3: Geometry helpers

**Files:**
- Create: `src/lib/geometry.ts`
- Test: `src/lib/geometry.test.ts`

**Interfaces:**
- Produces: `type Vec3 = [number, number, number]`, `type Aabb = { min: Vec3; max: Vec3 }`, `type Obb = { c: Vec3; h: Vec3; axes: [Vec3, Vec3, Vec3] }` (centre, half extents, unit axes), `obbCorners(o): Vec3[]` (8 corners), `obbBounds(o): Aabb`, `hull2d(pts: [number, number][]): [number, number][]` (counter-clockwise).

- [ ] **Step 1: Write the failing tests**

`src/lib/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { hull2d, obbBounds, obbCorners, type Obb } from './geometry'

const box = (yawDeg = 0): Obb => {
  const a = (yawDeg * Math.PI) / 180
  return { c: [10, 20, 5], h: [4, 2, 1], axes: [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]] }
}

describe('obbCorners', () => {
  it('returns the 8 corners of an axis-aligned box', () => {
    const c = obbCorners(box())
    expect(c).toHaveLength(8)
    expect(c).toContainEqual([6, 18, 4])
    expect(c).toContainEqual([14, 22, 6])
  })
})

describe('obbBounds', () => {
  it('matches the box when axis-aligned', () => {
    expect(obbBounds(box())).toEqual({ min: [6, 18, 4], max: [14, 22, 6] })
  })
  it('swaps extents when rotated 90°', () => {
    const b = obbBounds(box(90))
    expect(b.min[0]).toBeCloseTo(8)
    expect(b.max[0]).toBeCloseTo(12)
    expect(b.min[1]).toBeCloseTo(16)
    expect(b.max[1]).toBeCloseTo(24)
  })
  it('covers every corner at 30°', () => {
    const o = box(30)
    const b = obbBounds(o)
    for (const p of obbCorners(o)) {
      for (let k = 0; k < 3; k++) {
        expect(p[k]).toBeGreaterThanOrEqual(b.min[k] - 1e-9)
        expect(p[k]).toBeLessThanOrEqual(b.max[k] + 1e-9)
      }
    }
  })
})

describe('hull2d', () => {
  it('drops interior and duplicate points', () => {
    const h = hull2d([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [0, 0]])
    expect(h).toHaveLength(4)
    expect(h).toEqual(expect.arrayContaining([[0, 0], [2, 0], [2, 2], [0, 2]]))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/geometry.test.ts`
Expected: FAIL with "Failed to resolve import './geometry'".

- [ ] **Step 3: Implement `src/lib/geometry.ts`**

```ts
export type Vec3 = [number, number, number]
export type Aabb = { min: Vec3; max: Vec3 }
/** Oriented box: centre, half extents along its three unit axes. */
export type Obb = { c: Vec3; h: Vec3; axes: [Vec3, Vec3, Vec3] }

export function obbCorners(o: Obb): Vec3[] {
  const out: Vec3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p: Vec3 = [o.c[0], o.c[1], o.c[2]]
    for (let k = 0; k < 3; k++) p[k] += sx * o.h[0] * o.axes[0][k] + sy * o.h[1] * o.axes[1][k] + sz * o.h[2] * o.axes[2][k]
    out.push(p)
  }
  return out
}

/** World-axis bounding box of an oriented box. */
export function obbBounds(o: Obb): Aabb {
  const e = [0, 1, 2].map((k) => o.h[0] * Math.abs(o.axes[0][k]) + o.h[1] * Math.abs(o.axes[1][k]) + o.h[2] * Math.abs(o.axes[2][k]))
  return { min: [o.c[0] - e[0], o.c[1] - e[1], o.c[2] - e[2]], max: [o.c[0] + e[0], o.c[1] + e[1], o.c[2] + e[2]] }
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function hull2d(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: [number, number][]) => {
    const out: [number, number][] = []
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop()
      out.push(q)
    }
    return out.slice(0, -1)
  }
  return [...half(p), ...half([...p].reverse())]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/geometry.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry.ts src/lib/geometry.test.ts
git commit -m "feat: oriented-box geometry helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 4: Scenes and the 3D solver

The solver below was prototyped and measured before this plan was written. Every expectation in the tests matches the prototype's output. Copy the code exactly. If a test fails, the code was transcribed wrong. Do not loosen the test.

**Files:**
- Create: `src/lib/scenes.ts`, `src/lib/solver.ts`
- Test: `src/lib/solver.test.ts`

**Interfaces:**
- Consumes: `Aabb`, `Obb`, `Vec3` from `./geometry`. `Item`, `Quality`, `Step` from `./model`.
- Produces (scenes): `type Scene = { obstacles: Aabb[]; bounds: { x: [number, number]; y: [number, number] }; start: { axis: 0|1; max: number; side: number }; goal: { axis: 0|1; min: number } }`, `buildScene(step: Step, reach: number): Scene`, `STANDOFF = 35`.
- Produces (solver): `type Up = 'flat'|'side'|'end'`, `type Pose = { x; y; yaw; pitch; up }` (cm and radians), `type StepResult = { fits; margin; up: Up|null; tilt; path: Pose[]; tightestIndex }`, `type SolveOptions = { ups?: Up[]; maxPitchDeg?: number }`, `QUALITY`, `MAX_MARGIN = 20`, `localHalf(dims: Vec3, up: Up): Vec3`, `poseToObb(half: Vec3, p: Pose): Obb`, `solveStep(step, item, clearanceCm, quality, opts?): StepResult`.

- [ ] **Step 1: Write the failing tests**

`src/lib/solver.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { MAX_MARGIN, solveStep } from './solver'
import type { DoorwayStep, TurnStep } from './model'

/** Longest flat w-wide box that rounds a corner of corridor widths a and b (classic formula, minimised numerically). */
function lMax(a: number, b: number, w: number) {
  let m = Infinity
  for (let t = 0.001; t < Math.PI / 2; t += 0.0005) m = Math.min(m, a / Math.sin(t) + b / Math.cos(t) - w / (Math.sin(t) * Math.cos(t)))
  return m
}
const turn = (entryWidth: number, exitWidth: number, ceiling: number): TurnStep => ({ id: 't', kind: 'turn', entryWidth, exitWidth, ceiling })
const door = (width: number, height: number, approachWidth?: number): DoorwayStep => ({ id: 'd', kind: 'doorway', width, height, wallThickness: 12, approachWidth })
const flat2d = { ups: ['flat' as const], maxPitchDeg: 0 }

describe('turn kept flat matches the 2D corner formula', () => {
  const L = lMax(90, 90, 60) // ≈ 134.6 cm
  it('passes 15 cm under the limit', () => {
    const r = solveStep(turn(90, 90, 1000), { length: L - 15, width: 60, height: 40 }, 0, 'medium', flat2d)
    expect(r.fits).toBe(true)
    expect(r.path.length).toBeGreaterThan(1)
  })
  it('fails 15 cm over the limit', () => {
    expect(solveStep(turn(90, 90, 1000), { length: L + 15, width: 60, height: 40 }, 0, 'medium', flat2d).fits).toBe(false)
  })
})

describe('doorway', () => {
  it('passes a narrower item with half the gap as margin and no tilt', () => {
    const r = solveStep(door(80, 200), { length: 180, width: 70, height: 70 }, 0, 'low')
    expect(r.fits).toBe(true)
    expect(r.margin).toBeGreaterThan(3)
    expect(r.margin).toBeLessThanOrEqual(5.01)
    expect(r.tilt).toBe(0)
  })
  it('fails when the item is wider than the opening every way', () => {
    const r = solveStep(door(80, 200), { length: 180, width: 90, height: 90 }, 0, 'low')
    expect(r.fits).toBe(false)
    expect(r.margin).toBeLessThan(-3)
    expect(r.path).toEqual([])
    expect(r.up).toBeNull()
  })
  it('passes a tall narrow item stood on end', () => {
    const r = solveStep(door(80, 210), { length: 190, width: 60, height: 60 }, 0, 'low', { ups: ['end'], maxPitchDeg: 0 })
    expect(r.fits).toBe(true)
    expect(r.up).toBe('end')
  })
  it('turns a wardrobe in from a hallway', () => {
    expect(solveStep(door(80, 200, 100), { length: 60, width: 50, height: 180 }, 1, 'medium').fits).toBe(true)
  })
  it('hallway narrower than the item', () => {
    const r = solveStep(door(80, 200, 30), { length: 220, width: 95, height: 85 }, 1, 'medium')
    expect(r.fits).toBe(false)
    expect(r.margin).toBe(-MAX_MARGIN)
  })
  it('1 cm of clearance per side costs 1 cm of margin', () => {
    const item = { length: 180, width: 70, height: 70 }
    const a = solveStep(door(80, 200), item, 0, 'low').margin
    const b = solveStep(door(80, 200), item, 1, 'low').margin
    expect(a - b).toBeGreaterThan(0.9)
    expect(a - b).toBeLessThan(1.1)
  })
})

describe('tilt', () => {
  const item = { length: 200, width: 40, height: 40 }
  it('fails a narrow turn when kept flat', () => {
    expect(solveStep(turn(80, 80, 250), item, 0, 'low', flat2d).fits).toBe(false)
  })
  it('passes the same turn by tilting it up', () => {
    const r = solveStep(turn(80, 80, 250), item, 0, 'low', { ups: ['flat'] })
    expect(r.fits).toBe(true)
    expect(r.tilt).toBeGreaterThan(0)
  })
  it('stays stuck under a ceiling too low to tilt enough', () => {
    expect(solveStep(turn(80, 80, 150), item, 0, 'low', { ups: ['flat'] }).fits).toBe(false)
  })
})

describe('margin', () => {
  it('caps at +MAX_MARGIN for a tiny item and -MAX_MARGIN for a hopeless one', () => {
    expect(solveStep(door(80, 200), { length: 20, width: 20, height: 20 }, 0, 'low').margin).toBe(MAX_MARGIN)
    expect(solveStep(door(40, 200), { length: 200, width: 150, height: 150 }, 0, 'low').margin).toBe(-MAX_MARGIN)
  })
  it('is >= 0 exactly when it fits', () => {
    const cases = [
      solveStep(turn(100, 100, 260), { length: 150, width: 60, height: 50 }, 0, 'low'),
      solveStep(turn(80, 80, 150), { length: 200, width: 40, height: 40 }, 0, 'low'),
      solveStep(door(80, 200), { length: 180, width: 90, height: 90 }, 0, 'low'),
    ]
    for (const r of cases) expect(r.margin >= 0).toBe(r.fits)
  })
  it('points tightestIndex at a pose on the path', () => {
    const r = solveStep(turn(100, 100, 260), { length: 150, width: 60, height: 50 }, 0, 'low')
    expect(r.tightestIndex).toBeGreaterThanOrEqual(0)
    expect(r.tightestIndex).toBeLessThan(r.path.length)
  })
})

describe('huge items finish quickly', () => {
  it('gives up fast on a 20 m cube', () => {
    const t0 = performance.now()
    const r = solveStep(door(80, 200), { length: 2000, width: 2000, height: 2000 }, 1, 'medium')
    expect(r.fits).toBe(false)
    expect(performance.now() - t0).toBeLessThan(10000)
  })
  it('passes a 10 m beam straight through a door', () => {
    expect(solveStep(door(80, 200), { length: 1000, width: 50, height: 50 }, 1, 'medium').fits).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/solver.test.ts`
Expected: FAIL with "Failed to resolve import './solver'".

- [ ] **Step 3: Implement `src/lib/scenes.ts`**

```ts
import type { Aabb } from './geometry'
import type { Step } from './model'

const BIG = 10000

export type Scene = {
  obstacles: Aabb[]
  /** Range of box-centre positions to search. */
  bounds: { x: [number, number]; y: [number, number] }
  /**
   * Item is on the start line: its bounding box ends at or before `max` along `axis`
   * (0 = x, 1 = y). Cells further back are skipped. `side` additionally keeps the
   * start on the approach side of the other axis.
   */
  start: { axis: 0 | 1; max: number; side: number }
  /** Item is through: its bounding box begins at or after `min` along `axis`. */
  goal: { axis: 0 | 1; min: number }
}

/** Start line sits this far before the opening, so the item begins with room to spare. */
export const STANDOFF = 35

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Aabb => ({ min: [x0, y0, z0], max: [x1, y1, z1] })

/**
 * Obstacles for one step. The floor is z = 0 and is not an obstacle: the solver
 * always rests the box on it. `reach` is how far from an opening a box centre
 * must be for the box to be fully clear of it.
 */
export function buildScene(step: Step, reach: number): Scene {
  if (step.kind === 'turn') {
    // Entry runs along +x in y ∈ [0, a]; exit runs along +y in x ∈ [0, b]. Inner corner at (0, a).
    const a = step.entryWidth, b = step.exitWidth, c = step.ceiling
    return {
      obstacles: [
        box(-BIG, b + BIG, -BIG, 0, -BIG, BIG), // outer wall of the entry
        box(b, b + BIG, -BIG, BIG, -BIG, BIG), // outer wall of the exit
        box(-BIG, 0, a, BIG, -BIG, BIG), // inner corner block
        box(-BIG, BIG, -BIG, BIG, c, c + BIG), // ceiling
      ],
      bounds: { x: [-reach - STANDOFF, b], y: [0, a + reach] },
      start: { axis: 0, max: -STANDOFF, side: a },
      goal: { axis: 1, min: a },
    }
  }
  // Wall occupies y ∈ [0, t]; opening x ∈ [0, w], z ∈ [0, h]. Item goes from y < 0 to y > t.
  const { width: w, height: h, wallThickness: t, approachWidth: A } = step
  // ponytail: rooms either side assumed 250 cm tall (or the door height if taller); add a field if that bites
  const room = Math.max(h, 250)
  const obstacles = [
    box(-BIG, 0, 0, t, -BIG, BIG), // wall left of the opening
    box(w, BIG, 0, t, -BIG, BIG), // wall right of the opening
    box(0, w, 0, t, h, BIG), // above the opening
    box(-BIG, BIG, -BIG, BIG, room, room + BIG), // room ceiling
  ]
  if (A) obstacles.push(box(-BIG, BIG, -BIG, -A, -BIG, BIG)) // far wall of the approach hallway
  return {
    obstacles,
    bounds: A
      ? { x: [-reach - STANDOFF, w + reach], y: [-A, t + reach] }
      : { x: [-reach, w + reach], y: [-reach - STANDOFF, t + reach] },
    start: A ? { axis: 0, max: -STANDOFF, side: 0 } : { axis: 1, max: -STANDOFF, side: Infinity },
    goal: { axis: 1, min: t },
  }
}
```

- [ ] **Step 4: Implement `src/lib/solver.ts`**

```ts
import type { Obb, Vec3 } from './geometry'
import { buildScene, type Scene } from './scenes'
import type { Item, Quality, Step } from './model'

/** Which item dimension points up: smallest (flat), middle (side) or largest (end). */
export type Up = 'flat' | 'side' | 'end'
/** Box centre in plan (cm), yaw about vertical, pitch lifting the local x axis (radians). */
export type Pose = { x: number; y: number; yaw: number; pitch: number; up: Up }
export type StepResult = {
  fits: boolean
  /** cm the item could grow on every face (>= 0) or must shrink (< 0) to pass. */
  margin: number
  up: Up | null
  /** Largest tilt along the path, degrees. */
  tilt: number
  path: Pose[]
  tightestIndex: number
}
export type SolveOptions = { ups?: Up[]; maxPitchDeg?: number }

// ponytail: fixed grid is the accuracy limit (margin under-reads by up to ~one pos step); adaptive refinement near the tightest pose if that matters
export const QUALITY: Record<Quality, { pos: number; yawDeg: number; pitchDeg: number }> = {
  low: { pos: 4, yawDeg: 7.5, pitchDeg: 15 },
  medium: { pos: 3, yawDeg: 6, pitchDeg: 10 },
  high: { pos: 2, yawDeg: 5, pitchDeg: 7.5 },
}
/** Margins are reported within ±MAX_MARGIN cm, quantised to BUCKET cm while searching. */
export const MAX_MARGIN = 20
const BUCKET = 0.25
/** Search-only penalty (cm per degree of tilt) so ties go to the less tilted path. */
const TILT_COST = 0.01
const NB = Math.round((2 * MAX_MARGIN) / BUCKET) + 1
/** Cap on (x, y) grid positions per search. */
const MAX_POSITIONS = 60_000

/** Local half extents [x, y, z]: z is the up dimension, x the longest remaining one (the one that tilts). */
export function localHalf(dims: Vec3, up: Up): Vec3 {
  const [s, m, l] = [...dims].sort((a, b) => a - b)
  const [x, y, z] = up === 'flat' ? [l, m, s] : up === 'side' ? [l, s, m] : [m, s, l]
  return [x / 2, y / 2, z / 2]
}

function axesOf(yaw: number, pitch: number): [Vec3, Vec3, Vec3] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  return [[cp * cy, cp * sy, sp], [-sy, cy, 0], [-sp * cy, -sp * sy, cp]]
}

export function poseToObb(half: Vec3, p: Pose): Obb {
  // Rest the lowest corner on the floor: lifting only wastes ceiling room.
  const z = half[0] * Math.sin(p.pitch) + half[2] * Math.cos(p.pitch)
  return { c: [p.x, p.y, z], h: half, axes: axesOf(p.yaw, p.pitch) }
}

/**
 * Per-orientation constants for the clearance test. For every unit SAT axis L:
 * the box's projected radius, how fast it grows per cm of inflation, and each
 * obstacle's projected radius and centre.
 */
type Orient = { ext: [number, number]; cz: number; lift: number; n: number; L: Float64Array; rA: Float64Array; k: Float64Array; rB: Float64Array; tB: Float64Array }

const WORLD: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

function orient(half: Vec3, yaw: number, pitch: number, scene: Scene): Orient {
  const ax = axesOf(yaw, pitch)
  // World axes first: they reject far-away obstacles cheapest.
  const cand: Vec3[] = [...WORLD, ...ax]
  for (const a of ax) for (const w of WORLD) cand.push([a[1] * w[2] - a[2] * w[1], a[2] * w[0] - a[0] * w[2], a[0] * w[1] - a[1] * w[0]])
  const axes = cand.filter((v) => Math.hypot(...v) > 1e-9).map((v) => v.map((c) => c / Math.hypot(...v)) as Vec3)
  const n = axes.length, m = scene.obstacles.length
  const L = new Float64Array(n * 3), rA = new Float64Array(n), k = new Float64Array(n)
  const rB = new Float64Array(n * m), tB = new Float64Array(n * m)
  axes.forEach((a, i) => {
    L.set(a, i * 3)
    const p = ax.map((e) => Math.abs(e[0] * a[0] + e[1] * a[1] + e[2] * a[2]))
    rA[i] = half[0] * p[0] + half[1] * p[1] + half[2] * p[2]
    k[i] = p[0] + p[1] + p[2]
    scene.obstacles.forEach((b, j) => {
      let r = 0, t = 0
      for (let d = 0; d < 3; d++) {
        r += ((b.max[d] - b.min[d]) / 2) * Math.abs(a[d])
        t += ((b.max[d] + b.min[d]) / 2) * a[d]
      }
      rB[i * m + j] = r
      tB[i * m + j] = t
    })
  })
  const sp = Math.sin(pitch), cp = Math.cos(pitch)
  const ext = [0, 1].map((d) => half[0] * Math.abs(ax[0][d]) + half[1] * Math.abs(ax[1][d]) + half[2] * Math.abs(ax[2][d])) as [number, number]
  return { ext, cz: half[0] * sp + half[2] * cp, lift: sp + cp, n, L, rA, k, rB, tB }
}

/**
 * How many cm the box could grow on every face at (x, y) and stay clear of every
 * obstacle; negative = how much it must shrink. Exact per SAT axis: growing by d
 * adds d·k to the projected radius and lifts the centre by d·lift (it stays on
 * the floor). Clamped to ±MAX_MARGIN.
 */
function clearance(o: Orient, x: number, y: number, m: number): number {
  let worst = MAX_MARGIN
  for (let j = 0; j < m && worst > -MAX_MARGIN; j++) {
    let best = -MAX_MARGIN
    for (let i = 0; i < o.n && best < worst; i++) {
      const lz = o.L[i * 3 + 2]
      const t = o.tB[i * m + j] - (x * o.L[i * 3] + y * o.L[i * 3 + 1] + o.cz * lz)
      const sign = t >= 0 ? 1 : -1
      const sep = sign * t - o.rA[i] - o.rB[i * m + j]
      const rate = o.k[i] + sign * o.lift * lz
      const d = rate > 1e-9 ? sep / rate : sep > 0 ? MAX_MARGIN : -MAX_MARGIN
      if (d > best) best = d
    }
    if (best < worst) worst = best
  }
  return worst
}

/**
 * Widest-path search over a 4D grid (x, y, yaw, pitch) for one `up` choice: the
 * start→goal route whose tightest pose has the most clearance. Popping cells in
 * decreasing-clearance order (bucket queue, FIFO within a bucket) means the first
 * visit is the best one. It starts from a one-cell-thick layer at the start line
 * and ignores cells behind it: the approach is open, so they add nothing.
 * ponytail: only grid poses are checked, not the sweep between neighbours; steps are small enough for furniture
 */
export function search(scene: Scene, half: Vec3, up: Up, quality: Quality, maxPitchDeg: number): { path: Pose[]; clear: number[] } | null {
  const q = QUALITY[quality]
  const [bx0, x1] = scene.bounds.x, [by0, y1] = scene.bounds.y
  // ponytail: very long items get a coarser position grid instead of running out of memory
  const pos = Math.max(q.pos, Math.sqrt(((x1 - bx0) * (y1 - by0)) / MAX_POSITIONS))
  // Snap the grid to whole multiples of the step so cell positions don't shift with item size.
  const x0 = Math.floor(bx0 / pos) * pos, y0 = Math.floor(by0 / pos) * pos
  const nx = Math.floor((x1 - x0) / pos) + 1
  const ny = Math.floor((y1 - y0) / pos) + 1
  const nw = Math.round(360 / q.yawDeg)
  const np = Math.floor(maxPitchDeg / q.pitchDeg + 1e-9) + 1
  const no = nw * np, nxy = nx * ny, m = scene.obstacles.length
  const yawStep = (2 * Math.PI) / nw, pitchStep = (q.pitchDeg * Math.PI) / 180
  const xs = Float64Array.from({ length: nx }, (_, i) => x0 + i * pos)
  const ys = Float64Array.from({ length: ny }, (_, i) => y0 + i * pos)
  // Orientation o = iw + ip * nw; cell index = ix + iy * nx + o * nxy.
  const orients: Orient[] = []
  for (let ip = 0; ip < np; ip++) for (let iw = 0; iw < nw; iw++) orients.push(orient(half, iw * yawStep, ip * pitchStep, scene))
  const { start, goal } = scene
  const startExt = Float64Array.from(orients, (o) => o.ext[start.axis])
  const sideExt = Float64Array.from(orients, (o) => o.ext[1 - start.axis])
  const goalExt = Float64Array.from(orients, (o) => o.ext[goal.axis])
  const lead = (ix: number, iy: number, o: number) => (start.axis === 0 ? xs[ix] : ys[iy]) + startExt[o]
  const tail = (ix: number, iy: number, o: number) => (goal.axis === 0 ? xs[ix] : ys[iy]) - goalExt[o]
  const behind = start.max - pos

  // 0 unseen, 1 behind the start line, 2..9 reached via direction (state - 2), 10 start
  const state = new Uint8Array(nxy * no)
  const buckets: number[][] = Array.from({ length: NB }, () => [])
  const heads = new Int32Array(NB)
  let top = -1
  const push = (i: number, ix: number, iy: number, o: number, s: number, limit: number) => {
    if (lead(ix, iy, o) <= behind) { state[i] = 1; return }
    state[i] = s
    const c = Math.min(limit, clearance(orients[o], xs[ix], ys[iy], m) - TILT_COST * Math.floor(o / nw) * q.pitchDeg)
    const b = Math.max(0, Math.floor((c + MAX_MARGIN) / BUCKET))
    buckets[b].push(i)
    if (b > top) top = b
  }
  // Start untilted (o < nw is pitch 0); the search tilts only where that buys clearance.
  for (let o = 0; o < nw; o++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const l = lead(ix, iy, o)
    const s = (start.axis === 0 ? ys[iy] : xs[ix]) + sideExt[o]
    if (l <= start.max && l > behind && s <= start.side) push(ix + iy * nx + o * nxy, ix, iy, o, 10, MAX_MARGIN)
  }

  const decode = (i: number) => {
    const ix = i % nx, r = (i - ix) / nx, iy = r % ny
    return [ix, iy, (r - iy) / ny] as const
  }
  const pose = (i: number): Pose => {
    const [ix, iy, o] = decode(i)
    return { x: xs[ix], y: ys[iy], yaw: (o % nw) * yawStep, pitch: Math.floor(o / nw) * pitchStep, up }
  }
  const clearOf = (i: number) => {
    const [ix, iy, o] = decode(i)
    return clearance(orients[o], xs[ix], ys[iy], m)
  }
  /** Neighbour along direction d (0 +x, 1 -x, 2 +y, 3 -y, 4 +yaw, 5 -yaw, 6 +pitch, 7 -pitch), or -1 off-grid. */
  const next = (i: number, d: number): number => {
    const [ix, iy, o] = decode(i)
    const iw = o % nw, ip = (o - iw) / nw
    switch (d) {
      case 0: return ix + 1 < nx ? i + 1 : -1
      case 1: return ix > 0 ? i - 1 : -1
      case 2: return iy + 1 < ny ? i + nx : -1
      case 3: return iy > 0 ? i - nx : -1
      case 4: return iw + 1 < nw ? i + nxy : i - (nw - 1) * nxy // yaw wraps
      case 5: return iw > 0 ? i - nxy : i + (nw - 1) * nxy
      case 6: return ip + 1 < np ? i + nw * nxy : -1
      default: return ip > 0 ? i - nw * nxy : -1
    }
  }

  // Bucket 0 holds poses at the -MAX_MARGIN floor: the answer is already "short by MAX_MARGIN or more".
  while (top > 0) {
    if (heads[top] === buckets[top].length) { top--; continue }
    const i = buckets[top][heads[top]++]
    const [ix, iy, o] = decode(i)
    if (tail(ix, iy, o) >= goal.min) {
      const cells: number[] = []
      for (let c = i; ; c = next(c, (state[c] - 2) ^ 1)) { // walk back opposite to the arrival direction
        cells.push(c)
        if (state[c] === 10) break
      }
      cells.reverse()
      return { path: cells.map(pose), clear: cells.map(clearOf) }
    }
    const limit = (top + 1) * BUCKET - MAX_MARGIN
    const iw = o % nw, ip = (o - iw) / nw
    const ow = iw + 1 < nw ? o + 1 : o - iw, owm = iw > 0 ? o - 1 : o + nw - 1
    let j: number
    if (ix + 1 < nx && state[(j = i + 1)] === 0) push(j, ix + 1, iy, o, 2, limit)
    if (ix > 0 && state[(j = i - 1)] === 0) push(j, ix - 1, iy, o, 3, limit)
    if (iy + 1 < ny && state[(j = i + nx)] === 0) push(j, ix, iy + 1, o, 4, limit)
    if (iy > 0 && state[(j = i - nx)] === 0) push(j, ix, iy - 1, o, 5, limit)
    if (state[(j = i + (ow - o) * nxy)] === 0) push(j, ix, iy, ow, 6, limit)
    if (state[(j = i + (owm - o) * nxy)] === 0) push(j, ix, iy, owm, 7, limit)
    if (ip + 1 < np && state[(j = i + nw * nxy)] === 0) push(j, ix, iy, o + nw, 8, limit)
    if (ip > 0 && state[(j = i - nw * nxy)] === 0) push(j, ix, iy, o - nw, 9, limit)
  }
  return null
}

export function solveStep(step: Step, item: Item, clearanceCm: number, quality: Quality, opts: SolveOptions = {}): StepResult {
  const g = 2 * clearanceCm
  const dims: Vec3 = [item.length + g, item.width + g, item.height + g]
  const scene = buildScene(step, Math.hypot(...dims) / 2 + 2)
  let best: { up: Up; path: Pose[]; clear: number[]; margin: number } | null = null
  for (const up of opts.ups ?? ['flat', 'side', 'end']) {
    const r = search(scene, localHalf(dims, up), up, quality, opts.maxPitchDeg ?? 90)
    if (!r) continue
    const margin = r.clear.reduce((a, b) => Math.min(a, b))
    if (!best || margin > best.margin) best = { up, ...r, margin }
  }
  if (!best || best.margin < 0) return { fits: false, margin: best?.margin ?? -MAX_MARGIN, up: null, tilt: 0, path: [], tightestIndex: 0 }
  return {
    fits: true,
    margin: best.margin,
    up: best.up,
    tilt: Math.round(best.path.reduce((a, p) => Math.max(a, (p.pitch * 180) / Math.PI), 0)),
    path: best.path,
    tightestIndex: best.clear.indexOf(best.margin),
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/solver.test.ts`
Expected: PASS, 16 tests, about 20 s in total.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scenes.ts src/lib/solver.ts src/lib/solver.test.ts
git commit -m "feat: 3D widest-path solver for doorways and corridor turns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 5: i18n

**Files:**
- Create: `src/i18n.ts`
- Test: `src/i18n.test.ts`

**Interfaces:**
- Consumes: `Lang`, `Step` from `./lib/model`.
- Produces: `type T = (s: string, ...args: (string | number)[]) => string`, `tr(lang: Lang, s: string, ...args): string`, `N(s: string): string` (marks a string for translation and returns it unchanged), `STEP_LABEL: Record<Step['kind'], string>`, and `UK: Record<string, string>`.

- [ ] **Step 1: Write the failing tests**

`src/i18n.test.ts`:
```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tr, UK } from './i18n'

/** Literal strings passed to t('…') or N('…') anywhere in src/, excluding tests. */
function usedKeys(dir = 'src'): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...usedKeys(p))
    else if (/\.tsx?$/.test(name) && !name.includes('.test.')) {
      for (const m of readFileSync(p, 'utf8').matchAll(/\b[tN]\(\s*(['"])((?:(?!\1).)*)\1/g)) out.push(m[2])
    }
  }
  return out
}

describe('tr', () => {
  it('substitutes placeholders', () => {
    expect(tr('en', 'Error: {0}', 'boom')).toBe('Error: boom')
    expect(tr('uk', 'Error: {0}', 'boom')).toBe('Помилка: boom')
  })
  it('falls back to English for unknown strings', () => {
    expect(tr('uk', 'Not in the dictionary {0}', 1)).toBe('Not in the dictionary 1')
  })
})

describe('UK dictionary', () => {
  it('keeps the same placeholders as the English source', () => {
    const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join()
    for (const [en, uk] of Object.entries(UK)) expect(ph(uk), en).toBe(ph(en))
  })
  it('translates every string the UI uses', () => {
    const keys = [...usedKeys(), 'cm', 'in']
    expect(keys.length).toBeGreaterThan(5)
    expect(keys.filter((k) => !(k in UK))).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/i18n.test.ts`
Expected: FAIL with "Failed to resolve import './i18n'".

- [ ] **Step 3: Implement `src/i18n.ts`**

This holds every string used by Tasks 6–7, so the scan stays green as they land.

```ts
import type { Lang, Step } from './lib/model'

export type T = (s: string, ...args: (string | number)[]) => string

/** Marks a string for translation where it is defined away from its t() call. */
export const N = (s: string) => s

export const STEP_LABEL: Record<Step['kind'], string> = { doorway: N('Doorway'), turn: N('Corridor turn') }

/** English source string → Ukrainian. `{0}`, `{1}` are placeholders for interpolated values. */
export const UK: Record<string, string> = {
  'Furniture fits the corridor': 'Чи пройдуть меблі коридором',
  'Will it get through? A 3D check for doorways and corridor turns.': 'Чи пройде? 3D-перевірка для дверей і поворотів коридору.',
  'Results are estimates on a grid. Leave a little extra room.': 'Результати — оцінка на сітці. Залиште трохи запасу.',
  'Source on GitHub': 'Код на GitHub',
  Item: 'Предмет',
  Length: 'Довжина',
  Width: 'Ширина',
  Height: 'Висота',
  cm: 'см',
  in: 'дюйм',
  'Clearance per side': 'Запас з кожного боку',
  'Added to every side for wrapping and hands.': 'Додається з усіх боків на пакування та руки.',
  Settings: 'Налаштування',
  Units: 'Одиниці',
  Centimetres: 'Сантиметри',
  Inches: 'Дюйми',
  Quality: 'Точність',
  Fast: 'Швидко',
  Balanced: 'Збалансовано',
  Precise: 'Точно',
  Language: 'Мова',
  Theme: 'Тема',
  System: 'Системна',
  Light: 'Світла',
  Dark: 'Темна',
  Route: 'Маршрут',
  'Add a doorway or turn.': 'Додайте дверний проріз або поворот.',
  Doorway: 'Дверний проріз',
  'Corridor turn': 'Поворот коридору',
  'Move up': 'Вгору',
  'Move down': 'Вниз',
  Remove: 'Видалити',
  'Opening width': 'Ширина прорізу',
  'Opening height': 'Висота прорізу',
  'Wall thickness': 'Товщина стіни',
  'Hallway width in front': 'Ширина коридору перед дверима',
  'open space': 'відкритий простір',
  'Leave the hallway empty if you come from a room. Fill it in if you come along a hallway that runs past the door.':
    'Залиште коридор порожнім, якщо заходите з кімнати. Заповніть, якщо підходите коридором уздовж стіни з дверима.',
  'Corridor width before': 'Ширина коридору до повороту',
  'Corridor width after': 'Ширина коридору після повороту',
  'Ceiling height': 'Висота стелі',
  Result: 'Результат',
  'Checking…': 'Перевіряємо…',
  'Timed out. Try a faster quality setting.': 'Час вичерпано. Спробуйте швидший режим точності.',
  'Error: {0}': 'Помилка: {0}',
  "Doesn't fit: short by {0} or more": 'Не проходить: бракує {0} або більше',
  "Doesn't fit: short by {0}": 'Не проходить: бракує {0}',
  'lying flat': 'лежачи',
  'on its side': 'на боці',
  'stood on end': 'стоячи',
  ', tilted up to {0}°': ', з нахилом до {0}°',
  'Fits with {0}+ to spare': 'Проходить, запас {0}+',
  'Fits with {0} to spare': 'Проходить, запас {0}',
  'Fix the highlighted fields.': 'Виправте виділені поля.',
  "It won't fit: {0} of {1} steps blocked.": 'Не пройде: заблоковано кроків — {0} з {1}.',
  'It fits through the whole route.': 'Проходить увесь маршрут.',
  'Walk-through': 'Прохід',
  'Plan and side view of the selected step': 'План і вигляд збоку для вибраного кроку',
  "No path: it doesn't fit here.": 'Шляху немає: тут не проходить.',
  Pause: 'Пауза',
  Play: 'Відтворити',
  'Position along the path': 'Положення на шляху',
  'Tightest point': 'Найвужче місце',
  Plan: 'План',
  Side: 'Збоку',
}

export function tr(lang: Lang, s: string, ...args: (string | number)[]): string {
  const src = lang === 'uk' ? (UK[s] ?? s) : s
  return src.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i]))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/i18n.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts src/i18n.test.ts
git commit -m "feat: English/Ukrainian strings with a coverage test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 6: Workers, forms, results and the app shell

**Files:**
- Create: `src/useSolver.ts`, `src/solver.worker.ts`, `src/components/NumberField.tsx`, `src/components/ItemForm.tsx`, `src/components/RouteEditor.tsx`, `src/components/ResultPanel.tsx`
- Modify: `src/App.tsx` (full replacement)

**Interfaces:**
- Consumes: everything from `lib/model`, `solveStep`/`StepResult`/`MAX_MARGIN`/`Up` from `lib/solver`, and `tr`/`N`/`T`/`STEP_LABEL` from `i18n`.
- Produces:
  - `type StepStatus = { state: 'pending' } | { state: 'done'; result: StepResult } | { state: 'error'; message: string } | { state: 'timeout' }`
  - `useSolver(state: AppState, valid: boolean): Record<string, StepStatus>`
  - `WorkerRequest = { item: Item; clearance: number; quality: Quality; step: Step }`
  - `WorkerResponse = { result: StepResult } | { error: string }`
  - Task 7 adds `SceneView`, rendered by `App` as `<SceneView step item clearance status t />`.

- [ ] **Step 1: Worker and hook**

`src/solver.worker.ts`:
```ts
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
```

`src/useSolver.ts`:
```ts
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
  const [results, setResults] = useState<Record<string, StepStatus>>({})
  // Only what the solver reads: unit, language and theme changes must not re-solve.
  const key = JSON.stringify({ item: state.item, clearance: state.settings.clearance, quality: state.settings.quality, steps: state.steps })

  useEffect(() => {
    if (!valid) return
    const req = JSON.parse(key) as { item: Item; clearance: number; quality: Quality; steps: Step[] }
    setResults(Object.fromEntries(req.steps.map((s) => [s.id, { state: 'pending' } as StepStatus])))
    const workers: Worker[] = []
    const timers: number[] = []
    const debounce = window.setTimeout(() => {
      for (const step of req.steps) {
        const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
        workers.push(w)
        const finish = (st: StepStatus) => {
          window.clearTimeout(timer)
          w.terminate()
          setResults((r) => ({ ...r, [step.id]: st }))
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

  return results
}
```

- [ ] **Step 2: Form components**

`src/components/NumberField.tsx`:
```tsx
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
```

`src/components/ItemForm.tsx`:
```tsx
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
```

`src/components/RouteEditor.tsx`:
```tsx
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
```

- [ ] **Step 3: Results panel**

`src/components/ResultPanel.tsx`:
```tsx
import { toUnit, type Step, type Unit } from '../lib/model'
import { MAX_MARGIN, type Up } from '../lib/solver'
import { N, STEP_LABEL, type T } from '../i18n'
import type { StepStatus } from '../useSolver'

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
  const how = t(UP_LABEL[r.up ?? 'flat']) + (r.tilt > 0 ? t(', tilted up to {0}°', r.tilt) : '')
  const spare = r.margin >= MAX_MARGIN ? t('Fits with {0}+ to spare', m) : t('Fits with {0} to spare', m)
  return { cls: 'ok-text', icon: '✓', text: `${spare} · ${how}` }
}

export default function ResultPanel({ steps, results, unit, invalid, selected, onSelect, t }: Props) {
  const sts = steps.map((s) => results[s.id])
  const blocked = sts.filter((s) => s?.state === 'done' && !s.result.fits).length
  const allDone = sts.every((s) => s?.state === 'done')
  const verdict = invalid
    ? { cls: 'warn', text: t('Fix the highlighted fields.') }
    : steps.length === 0
      ? { cls: '', text: t('Add a doorway or turn.') }
      : blocked > 0
        ? { cls: 'err', text: t("It won't fit: {0} of {1} steps blocked.", blocked, steps.length) }
        : allDone
          ? { cls: 'ok', text: t('It fits through the whole route.') }
          : { cls: '', text: t('Checking…') }
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
```

- [ ] **Step 4: App shell**

`src/App.tsx` (full replacement; Task 7 adds the SceneView lines that are marked here):
```tsx
import { useEffect, useMemo, useState } from 'react'
import { invalidFields, loadState, saveState, type AppState } from './lib/model'
import { tr, type T } from './i18n'
import { useSolver } from './useSolver'
import ItemForm from './components/ItemForm'
import RouteEditor from './components/RouteEditor'
import ResultPanel from './components/ResultPanel'

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
          {/* SceneView goes here in Task 7 */}
        </main>
      </div>
      <p className="hint foot">
        {t('Results are estimates on a grid. Leave a little extra room.')}{' '}
        <a href="https://github.com/hermes98761234/furniture-fits-the-corridor">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Verify build, lint and tests**

Run: `npm run build && npm run lint && npm test`
Expected: the build succeeds and emits a separate worker chunk (`dist/assets/solver.worker-*.js`). Lint shows 0 errors and all tests pass, including the i18n scan, which now covers the components.

- [ ] **Step 6: Smoke-test in a real browser**

Run:
```bash
npm run build && (npx vite preview --port 4173 --strictPort > /tmp/fftc-preview.log 2>&1 &) && sleep 2
chromium --headless=new --disable-gpu --hide-scrollbars --window-size=1280,900 --virtual-time-budget=20000 \
  --screenshot=/tmp/fftc-smoke.png http://localhost:4173/
pkill -f "vite preview --port 4173"
```
Open `/tmp/fftc-smoke.png` with the Read tool.

Expected: the item form, three route cards, and a result table with ✓ or ✗ rows (not all "Checking…"). If every row still shows "Checking…", re-run with `--timeout=20000` in place of `--virtual-time-budget=20000`, which waits in real time.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: route editor, parallel solver workers and results panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 7: Animated scene view

**Files:**
- Create: `src/components/SceneView.tsx`
- Modify: `src/App.tsx` (import plus one JSX line)

**Interfaces:**
- Consumes: `buildScene` from `lib/scenes`, `localHalf`/`poseToObb`/`Pose` from `lib/solver`, `obbCorners`/`hull2d`/`Vec3` from `lib/geometry`, `StepStatus` from `useSolver`, and `T` from `i18n`.
- Produces: `<SceneView step: Step, item: Item, clearance: number, status: StepStatus | undefined, t: T />`.

- [ ] **Step 1: Write `src/components/SceneView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { buildScene } from '../lib/scenes'
import { localHalf, poseToObb, type Pose } from '../lib/solver'
import { hull2d, obbCorners, type Vec3 } from '../lib/geometry'
import type { Item, Step } from '../lib/model'
import type { StepStatus } from '../useSolver'
import type { T } from '../i18n'

type Props = { step: Step; item: Item; clearance: number; status: StepStatus | undefined; t: T }

const FRAME_MS = 60
/** Obstacles wider than this are the "infinite" ceiling slab, which plan view skips. */
const FINITE = 1000

/** world (u, v) → screen: x = ox + u·s, y = oy − v·s (v up). */
type View = { ox: number; oy: number; s: number }

function fit(u0: number, u1: number, v0: number, v1: number, left: number, top: number, w: number, h: number): View {
  const s = Math.min(w / (u1 - u0), h / (v1 - v0))
  return { s, ox: left + (w - (u1 - u0) * s) / 2 - u0 * s, oy: top + h - (h - (v1 - v0) * s) / 2 + v0 * s }
}

function draw(cv: HTMLCanvasElement, step: Step, half: Vec3, pose: Pose | null, tight: Pose | null, t: T) {
  const dpr = window.devicePixelRatio || 1
  const W = cv.clientWidth, H = cv.clientHeight
  if (!W || !H) return
  cv.width = Math.round(W * dpr)
  cv.height = Math.round(H * dpr)
  const g = cv.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const css = getComputedStyle(cv)
  const col = (name: string) => css.getPropertyValue(name).trim()
  g.fillStyle = col('--chart-bg')
  g.fillRect(0, 0, W, H)

  const scene = buildScene(step, Math.hypot(...half) + 2)
  const { bounds } = scene
  const top = step.kind === 'turn' ? step.ceiling : Math.max(step.height, 250)
  const sideAxis = step.kind === 'doorway' ? 1 : 0 // doorway: look along the wall; turn: along the entry
  const planH = Math.round(H * 0.6)
  const pad = 10, label = 16

  const rect = (v: View, u0: number, u1: number, v0: number, v1: number) =>
    g.rect(v.ox + u0 * v.s, v.oy - v1 * v.s, (u1 - u0) * v.s, (v1 - v0) * v.s)
  const shape = (v: View, p: Pose, a: number, b: number) => {
    const pts = hull2d(obbCorners(poseToObb(half, p)).map((c) => [c[a], c[b]] as [number, number]))
    g.beginPath()
    pts.forEach(([u, w], i) => (i ? g.lineTo(v.ox + u * v.s, v.oy - w * v.s) : g.moveTo(v.ox + u * v.s, v.oy - w * v.s)))
    g.closePath()
  }
  const item = (v: View, a: number, b: number) => {
    if (tight) {
      shape(v, tight, a, b)
      g.setLineDash([5, 4]); g.strokeStyle = col('--err'); g.lineWidth = 1.5; g.stroke(); g.setLineDash([])
    }
    if (pose) {
      shape(v, pose, a, b)
      g.globalAlpha = 0.35; g.fillStyle = col('--accent'); g.fill(); g.globalAlpha = 1
      g.strokeStyle = col('--accent'); g.lineWidth = 2; g.stroke()
    }
  }
  const caption = (text: string, y: number) => {
    g.fillStyle = col('--chart-fg'); g.font = '12px system-ui, sans-serif'; g.fillText(text, pad, y)
  }

  // Plan view: walls filled, the lintel dashed, the infinite ceiling skipped.
  const pv = fit(bounds.x[0], bounds.x[1], bounds.y[0], bounds.y[1], pad, pad + label, W - 2 * pad, planH - 2 * pad - label)
  g.save(); g.beginPath(); g.rect(0, 0, W, planH); g.clip()
  for (const o of scene.obstacles) {
    g.beginPath(); rect(pv, o.min[0], o.max[0], o.min[1], o.max[1])
    if (o.min[2] <= 0) {
      g.fillStyle = col('--panel2'); g.fill(); g.strokeStyle = col('--grid-strong'); g.lineWidth = 1; g.stroke()
    } else if (o.max[0] - o.min[0] < FINITE) {
      g.setLineDash([4, 4]); g.strokeStyle = col('--ref-line'); g.stroke(); g.setLineDash([])
    }
  }
  item(pv, 0, 1)
  g.restore()
  caption(t('Plan'), pad + 10)

  // Side view: floor, ceiling and lintel along the side axis, with the item's silhouette.
  g.strokeStyle = col('--line'); g.beginPath(); g.moveTo(0, planH + 0.5); g.lineTo(W, planH + 0.5); g.stroke()
  const sv = fit(bounds[sideAxis === 0 ? 'x' : 'y'][0], bounds[sideAxis === 0 ? 'x' : 'y'][1], 0, top + 10, pad, planH + pad + label, W - 2 * pad, H - planH - 2 * pad - label)
  g.save(); g.beginPath(); g.rect(0, planH, W, H - planH); g.clip()
  for (const o of scene.obstacles) {
    if (o.min[2] <= 0) continue // walls run floor to ceiling; a side cut through the opening misses them
    g.beginPath(); rect(sv, o.min[sideAxis], o.max[sideAxis], o.min[2], Math.min(o.max[2], top + 1000))
    g.fillStyle = col('--panel2'); g.fill(); g.strokeStyle = col('--ref-line'); g.lineWidth = 1; g.stroke()
  }
  g.strokeStyle = col('--grid-strong'); g.lineWidth = 2
  g.beginPath(); g.moveTo(0, sv.oy); g.lineTo(W, sv.oy); g.stroke()
  item(sv, sideAxis, 2)
  g.restore()
  caption(t('Side'), planH + pad + 10)
}

export default function SceneView({ step, item, clearance, status, t }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const result = status?.state === 'done' ? status.result : null
  const path = result?.path ?? []
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [, setSize] = useState(0)
  const g2 = 2 * clearance
  const half = localHalf([item.length + g2, item.width + g2, item.height + g2], result?.up ?? 'flat')
  const pose = path.length ? path[Math.min(frame, path.length - 1)] : null
  const tight = result?.fits ? path[result.tightestIndex] : null

  useEffect(() => {
    if (!playing || path.length < 2) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % path.length), FRAME_MS)
    return () => window.clearInterval(id)
  }, [playing, path.length])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ro = new ResizeObserver(() => setSize(cv.clientWidth * 100000 + cv.clientHeight))
    ro.observe(cv)
    return () => ro.disconnect()
  }, [])

  // Redraw on every render: it is cheap, and it picks up theme and language changes.
  useEffect(() => {
    if (ref.current) draw(ref.current, step, half, pose, tight, t)
  })

  const message = !status || status.state === 'pending' ? t('Checking…') : result && !result.fits ? t("No path: it doesn't fit here.") : null
  return (
    <section className="box scene">
      <h3>{t('Walk-through')}</h3>
      <div className="scene-canvas">
        <canvas ref={ref} role="img" aria-label={t('Plan and side view of the selected step')} />
        {message && <div className="scene-msg">{message}</div>}
      </div>
      {result && path.length > 1 && (
        <div className="row">
          <button onClick={() => setPlaying(!playing)}>{playing ? t('Pause') : t('Play')}</button>
          <input type="range" min={0} max={path.length - 1} value={Math.min(frame, path.length - 1)} aria-label={t('Position along the path')}
            onChange={(e) => { setPlaying(false); setFrame(+e.target.value) }} />
          <button onClick={() => { setPlaying(false); setFrame(result.tightestIndex) }}>{t('Tightest point')}</button>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Wire it into `src/App.tsx`**

Add the import after the `ResultPanel` import:
```tsx
import SceneView from './components/SceneView'
```
Replace the line `{/* SceneView goes here in Task 7 */}` with the following. Keying on the status remounts the view, which resets the frame and play state whenever a new result arrives.
```tsx
          {sel && (
            <SceneView key={`${sel.id}:${results[sel.id]?.state}`} step={sel} item={item} clearance={settings.clearance} status={results[sel.id]} t={t} />
          )}
```

- [ ] **Step 3: Verify build, lint and tests**

Run: `npm run build && npm run lint && npm test`
Expected: everything passes, and the i18n scan covers the SceneView strings.

- [ ] **Step 4: Check it visually, in light and dark, at desktop and phone width**

Run:
```bash
npm run build && (npx vite preview --port 4173 --strictPort > /tmp/fftc-preview.log 2>&1 &) && sleep 2
chromium --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1000 --virtual-time-budget=20000 --screenshot=/tmp/fftc-desktop.png http://localhost:4173/
chromium --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1000 --virtual-time-budget=20000 --force-dark-mode --blink-settings=preferredColorScheme=0 --screenshot=/tmp/fftc-dark.png http://localhost:4173/
chromium --headless=new --disable-gpu --hide-scrollbars --window-size=360,2200 --virtual-time-budget=20000 --screenshot=/tmp/fftc-phone.png http://localhost:4173/
pkill -f "vite preview --port 4173"
```
Open all three PNGs with the Read tool.

Expected:
- The plan view shows the walls with the item outline inside the doorway scene, and the side view shows the floor and lintel.
- The dark screenshot uses dark tokens.
- The phone screenshot has no horizontal overflow, and its inputs are not clipped.

If every row still shows "Checking…", swap in `--timeout=20000`. Fix anything that is off before committing.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: animated plan and side view of each step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 8: Page decoration — meta, icons, social image

**Files:**
- Create: `public/favicon.svg`, `public/manifest.webmanifest`, `public/robots.txt`, `public/sitemap.xml`, `scripts/icon.html`, `scripts/og.html`, `scripts/render-images.sh`, and the generated `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/og-image.png`
- Modify: `index.html` (full replacement)

- [ ] **Step 1: Icon and static files**

`public/favicon.svg` (a sofa going round an L-shaped corridor corner):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2563eb"/>
  <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".6">
    <path d="M12 56V12h44"/>
    <path d="M30 56V30h26"/>
  </g>
  <g transform="rotate(-45 22 22)">
    <rect x="9" y="17" width="26" height="10" rx="3" fill="#fff"/>
    <rect x="9" y="13" width="26" height="5" rx="2" fill="#fbbf24"/>
  </g>
</svg>
```

`public/manifest.webmanifest`:
```json
{
  "name": "Furniture Fits the Corridor",
  "short_name": "Fits?",
  "description": "Check whether furniture gets through your doorways and corridor turns, in 3D.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f4f5f7",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`public/robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://hermes98761234.github.io/furniture-fits-the-corridor/sitemap.xml
```

`public/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hermes98761234.github.io/furniture-fits-the-corridor/</loc>
    <changefreq>monthly</changefreq>
  </url>
</urlset>
```

- [ ] **Step 2: Render sources and script**

`scripts/icon.html` (full-bleed blue, so PNG icons have no white corners):
```html
<!doctype html>
<html><body style="margin:0;background:#2563eb">
<img src="../public/favicon.svg" style="width:100vw;height:100vh;display:block" alt="">
</body></html>
```

`scripts/og.html`:
```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; width: 1200px; height: 630px; display: flex; align-items: center; gap: 56px; padding: 0 80px; box-sizing: border-box;
    background: linear-gradient(135deg, #0f1115 0%, #1f232c 100%); color: #e6e8ec; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  img { width: 300px; height: 300px; border-radius: 64px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  h1 { font-size: 64px; line-height: 1.05; margin: 0 0 20px; }
  p { font-size: 28px; color: #9aa1ad; margin: 0 0 28px; line-height: 1.35; }
  .url { font-size: 22px; color: #3b82f6; }
</style>
</head>
<body>
  <img src="../public/favicon.svg" alt="">
  <div>
    <h1>Will your sofa fit through the door?</h1>
    <p>A free 3D check for doorways and corridor turns: margin, orientation and a walk-through.</p>
    <div class="url">hermes98761234.github.io/furniture-fits-the-corridor</div>
  </div>
</body>
</html>
```

`scripts/render-images.sh`:
```bash
#!/usr/bin/env bash
# Renders the PNG icons and social image from the SVG/HTML sources with headless Chromium.
# Run after editing the art; the outputs in public/ are committed.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME=${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome)}
shot() { # src width height out
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size="$2,$3" --screenshot="$PWD/$4" "file://$PWD/$1" 2>/dev/null
}
shot scripts/icon.html 512 512 public/icon-512.png
shot scripts/icon.html 192 192 public/icon-192.png
shot scripts/icon.html 180 180 public/apple-touch-icon.png
shot scripts/og.html 1200 630 public/og-image.png
ls -l public/*.png
```

- [ ] **Step 3: Render and inspect**

Run: `chmod +x scripts/render-images.sh && scripts/render-images.sh`
Expected: four PNGs are listed. Open `public/icon-512.png` and `public/og-image.png` with the Read tool. The icon should show a white/yellow sofa diagonally in an L-shaped corridor on blue. The OG card should show the icon, the headline and the URL with nothing cut off.

- [ ] **Step 4: Replace `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Furniture Fits the Corridor: will your sofa get through the door?</title>
    <meta name="description" content="Free 3D calculator: enter your sofa, wardrobe or table size and your doorways and corridor turns, and see if it gets through, how much room is left, and how to tilt it. Runs in your browser." />
    <meta name="keywords" content="will my sofa fit, furniture fit calculator, sofa through door, couch corridor turn, moving furniture, doorway clearance, wardrobe hallway, tilt sofa" />
    <meta name="author" content="Volodymyr Kopytsia" />
    <meta name="robots" content="index, follow" />
    <meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)" />
    <meta name="color-scheme" content="light dark" />
    <link rel="canonical" href="https://hermes98761234.github.io/furniture-fits-the-corridor/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="Fits?" />

    <!-- Open Graph / Facebook / Telegram / Slack -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Furniture Fits the Corridor" />
    <meta property="og:url" content="https://hermes98761234.github.io/furniture-fits-the-corridor/" />
    <meta property="og:title" content="Will your sofa fit through the door?" />
    <meta property="og:description" content="A free 3D check for doorways and corridor turns: margin, orientation and an animated walk-through." />
    <meta property="og:image" content="https://hermes98761234.github.io/furniture-fits-the-corridor/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="A sofa turning a corridor corner, with the headline: will your sofa fit through the door?" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="uk_UA" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Will your sofa fit through the door?" />
    <meta name="twitter:description" content="A free 3D check for doorways and corridor turns. Runs in your browser." />
    <meta name="twitter:image" content="https://hermes98761234.github.io/furniture-fits-the-corridor/og-image.png" />

    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Furniture Fits the Corridor",
        "url": "https://hermes98761234.github.io/furniture-fits-the-corridor/",
        "description": "Checks in 3D whether a piece of furniture gets through doorways and corridor turns, with margin, orientation and an animated walk-through.",
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any",
        "browserRequirements": "Requires JavaScript and Web Workers",
        "inLanguage": ["en", "uk"],
        "isAccessibleForFree": true,
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "author": { "@type": "Person", "name": "Volodymyr Kopytsia" }
      }
    </script>
  </head>
  <body>
    <noscript>This calculator needs JavaScript.</noscript>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Verify the build rewrites the asset paths**

Run: `npm run build && grep -o 'href="[^"]*favicon.svg"' dist/index.html && ls dist/og-image.png dist/manifest.webmanifest`
Expected: the href is relative (`./favicon.svg`), and both files exist in `dist/`.

If the href is still `/favicon.svg`, change the four `/…` icon and manifest hrefs in `index.html` to `./…` and rebuild.

- [ ] **Step 6: Commit**

```bash
git add index.html public scripts
git commit -m "feat: icons, social card, manifest and SEO meta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

---

### Task 9: README, CI, public repo and GitHub Pages

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`, `docs/screenshot.png`

- [ ] **Step 1: Workflows**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Screenshot for the README**

Run:
```bash
npm run build && (npx vite preview --port 4173 --strictPort > /tmp/fftc-preview.log 2>&1 &) && sleep 2
chromium --headless=new --disable-gpu --hide-scrollbars --window-size=1440,960 --virtual-time-budget=20000 --screenshot="$PWD/docs/screenshot.png" http://localhost:4173/
pkill -f "vite preview --port 4173"
```
Open `docs/screenshot.png` with the Read tool. Expected: finished results (✓/✗ rows, not "Checking…") and a drawn scene. If it isn't finished, use `--timeout=20000` in place of `--virtual-time-budget=20000`.

- [ ] **Step 3: README**

`README.md`:
````markdown
# Furniture Fits the Corridor

Will your sofa get through the door? Enter the furniture's size and every doorway and corridor turn on the way in. The calculator searches in 3D, turning the item and tilting it up, and tells you whether it fits, how much room is left, and how to hold it. It then animates the move.

**Try it: [hermes98761234.github.io/furniture-fits-the-corridor](https://hermes98761234.github.io/furniture-fits-the-corridor/)**

[![Deploy to GitHub Pages](https://github.com/hermes98761234/furniture-fits-the-corridor/actions/workflows/deploy.yml/badge.svg)](https://github.com/hermes98761234/furniture-fits-the-corridor/actions/workflows/deploy.yml)

![The calculator checking a sofa against a front door, a hallway turn and a bedroom door, with an animated plan and side view](docs/screenshot.png)

## Features

- **A real 3D search.** It tries the item lying flat, on its side and stood on end, rotated and tilted up to 90°, under your actual ceiling height.
- **Doorways and 90° corridor turns**, chained into a route. A doorway can open off a narrow hallway, which is the case that usually bites.
- **Margin, not just yes/no.** You get "fits with 3.5 cm to spare" or "short by 4 cm", including the clearance you add for wrapping and hands.
- **An animated walk-through** in plan and side view, with a jump to the tightest point.
- **Centimetres or inches, English or Ukrainian, light or dark theme.** Your inputs are remembered in the browser.
- **Nothing to install.** It runs in any modern browser, and the heavy maths runs in Web Workers, one per step, in parallel.

## How it works

Each step becomes a set of box-shaped obstacles: walls, the ceiling, and the wall around a door opening. The item is a box resting on the floor. Its pose is position, yaw and tilt, plus which side is up.

For every pose on a grid, the solver works out in closed form how many centimetres the box could grow on every side before touching anything. It uses the separating-axis test, one axis at a time. A widest-path search over that 4D grid then finds the route from the start line to the far side whose tightest pose has the most room. That room is the margin. A negative margin is how much smaller the item would need to be.

The grid sets the precision. Margins can read up to about one grid step low (2–4 cm depending on the quality setting), so leave a little extra room.

The solver is checked against the classic 2D "sofa round a corner" formula.

## Quick start

You need [Node.js](https://nodejs.org/) 22.

```bash
git clone https://github.com/hermes98761234/furniture-fits-the-corridor.git
cd furniture-fits-the-corridor
npm install
npm run dev       # http://localhost:5173
npm test          # solver, model and i18n tests
npm run build     # static site in dist/
```

## License

MIT
````

- [ ] **Step 4: Commit locally**

```bash
git add .github README.md docs/screenshot.png
git commit -m "docs: README with screenshot; CI and Pages workflows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011SM912PkaeLUhzha37PejK"
```

- [ ] **Step 5: Create the public repo, enable Pages, push**

The user asked for a public repo, so this outward-facing step is authorised. Run:
```bash
gh repo create hermes98761234/furniture-fits-the-corridor --public --source . --remote origin \
  --description "Will your sofa fit through the door? A 3D calculator for doorways and corridor turns." \
  --homepage https://hermes98761234.github.io/furniture-fits-the-corridor/
gh api -X POST repos/hermes98761234/furniture-fits-the-corridor/pages -f build_type=workflow
gh repo edit hermes98761234/furniture-fits-the-corridor --add-topic furniture,moving,calculator,react,vite,geometry
git push -u origin main
```
Expected: the repo is created, the Pages API returns JSON with `"build_type": "workflow"`, and the push succeeds.

- [ ] **Step 6: Watch the deploy and verify it is live**

Run:
```bash
sleep 5 && gh run watch --exit-status $(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
curl -sfL https://hermes98761234.github.io/furniture-fits-the-corridor/ | grep -o '<title>[^<]*</title>'
curl -sfLo /dev/null -w '%{http_code}\n' https://hermes98761234.github.io/furniture-fits-the-corridor/og-image.png
```
Expected: the run concludes `success`, the title is "Furniture Fits the Corridor: will your sofa get through the door?", and the OG image returns `200`.

If the run fails, read `gh run view --log-failed`, fix the problem, commit and push again.

Finally, screenshot the live URL with headless Chromium, using the Step 2 command against the live URL, and open it. The results should finish and the scene should draw.
````

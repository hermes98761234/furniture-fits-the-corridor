# Furniture Fits the Corridor — Design

Date: 2026-10-09

A browser calculator that answers "will this piece of furniture get through my doorways and corridor turns?" It does a real 3D search (yaw and tilt) and shows an animated walk-through of the move.

## Scope

In scope:
- A route made of ordered steps. Each step is a **doorway** or a **90° corridor turn**.
- The item is a rectangular box (L × W × H) with a global clearance.
- A 3D pose search with pass/fail, a signed margin, the working orientation, and an animated path for each step.
- cm/inch toggle, English and Ukrainian.
- Public GitHub repo, CI, GitHub Pages deploy, and a polished landing page (meta and OG tags, icons, README with screenshot).

Out of scope: stairs, item shapes other than a box, turns at angles other than 90°, a separate straight-corridor step (a doorway already covers the cross-section check), and server-side code.

## Architecture

- React 19, Vite and TypeScript. Vitest for tests and oxlint for linting, as in WebVNA.
- State is plain React state persisted to `localStorage`, with no state library. Every storage read and write is wrapped in try/catch.
- `src/index.css` copies WebVNA's token sheet: `--bg`, `--panel`, `--panel2`, `--fg`, `--muted`, `--line`, `--accent`, `--ok`, `--warn`, `--err`, the light and dark blocks (`prefers-color-scheme`, `[data-theme]`), and the button, input and panel styles. The theme follows the system, with a manual toggle.
- The solver runs in a Web Worker (`src/solver.worker.ts`), so the UI never blocks.
- Vite sets `base: '/furniture-fits-the-corridor/'` for Pages.

## Model

All lengths are stored in cm. Display converts to inches when that unit is selected.

```ts
type Item = { length: number; width: number; height: number };
type Settings = { clearance: number; unit: 'cm' | 'in'; lang: 'en' | 'uk'; quality: 'low' | 'medium' | 'high' };
type Step =
  | { id: string; kind: 'doorway'; width: number; height: number; wallThickness: number; approachWidth?: number }
  | { id: string; kind: 'turn'; entryWidth: number; exitWidth: number; ceiling: number };
```

- The default clearance is 1 cm. It is added to every face of the item, so each dimension grows by 2 × clearance.
- `approachWidth` on a doorway is the width of the hallway the item comes from. That hallway runs parallel to the wall, so the item has to turn into the door. If it is blank, the approach is open space and the item can be lined up straight.
- A turn has one ceiling height. A doorway's height is its opening. Its ceiling is assumed to be no lower than the opening.

## Solver (`src/lib/`, pure, no DOM)

### `geometry.ts`
- `obbIntersectsAabb(obb, aabb): boolean` — the separating-axis test with 15 axes (3 box axes, 3 world axes, and 9 cross products).
- `poseToObb(item, pose): Obb`.

### `scenes.ts`
`buildScene(step, item): Scene` returns:
- `obstacles: Aabb[]` — wall blocks, the floor and ceiling slabs, and the doorway wall pieces on each side and above the opening.
- `start` and `goal` predicates — the box lies fully inside the entry region, or fully inside the exit region.
- `bounds` — the x and y range to search.

### `solver.ts`
- **Pose:** `{ x, y, yaw, pitch, up }`. `up` is one of 3 choices for which item dimension points vertically before any pitch is applied. Height (z) is not a free variable: the lowest corner of the box sits on the floor. That is always optimal, because the floor is the only lower limit and lifting the item only uses up ceiling room.
- **Grid:** a 4D occupancy grid over (x, y, yaw, pitch) for each `up` choice. Yaw covers [0, 360°) and wraps around in the neighbour search. Pitch covers [0, 90°]. Because the box is symmetric, pitch −θ at yaw ψ is the same pose as pitch θ at yaw ψ + 180°. Roll is not searched: tilting about one axis plus the 3 `up` choices covers how people actually carry furniture. A `ponytail:` comment records that as the upgrade path. The quality setting sets the resolution (approximate cells per orientation):
  - low: about 40 × 40 × 48 × 10
  - medium: about 60 × 60 × 72 × 15
  - high: about 90 × 90 × 96 × 20

  The cells are stored in typed arrays. A `ponytail:` comment marks the grid resolution as the accuracy limit and names the upgrade path (adaptive refinement near the tightest point).
- **Search:** a breadth-first search over 4D neighbours (±1 on each axis) between free cells. It runs from any free start cell to any free goal cell, and the parent pointers rebuild the path.
- **Margin:** a binary search on δ, where the item is inflated by δ on each face (δ can be negative). The margin is the largest δ that still gives a path. The search range is [−50 cm, +50 cm], with about 8 iterations at a 0.5 cm tolerance.
- **Output:**
  ```ts
  type StepResult = {
    fits: boolean;
    margin: number;          // cm; positive = spare, negative = short
    orientation: string;     // i18n key + params, e.g. on-end, tilt 35°
    path: Pose[];            // empty if it does not fit
    tightestIndex: number;   // frame with least clearance
  };
  ```
- **Worker protocol:** the worker receives `{ requestId, item, settings, steps }` and posts one `{ requestId, stepId, result | error }` message per step. When a new request arrives, the stale one is abandoned. Results that carry an old `requestId` are ignored.

## UI (`src/components/`)

- **`ItemForm`** — L, W and H fields, clearance, the unit toggle, the quality select, the language select and the theme toggle.
- **`RouteEditor`** — a list of step cards. Each card has a type select, the fields for that type, up/down buttons and a remove button. "Add doorway" and "Add turn" buttons go at the bottom. The default route is a doorway, then a turn, then a doorway, filled with typical apartment sizes.
- **`ResultPanel`** — one row per step: ✓ or ✗ (using `--ok` / `--err`), the margin ("+3.2 cm spare" / "−4.1 cm short"), and the working orientation. Below the rows is an overall verdict. Clicking a row selects that step in `SceneView`.
- **`SceneView`** — a canvas with the plan view on top and the side view below, for the selected step. It draws the walls and the item's projected outline. Play/pause and a scrub slider move through `path`, and the tightest frame is highlighted. The canvas reads its colours from the CSS tokens, so it follows the theme.
- **`i18n.ts`** — flat `en` and `uk` dictionaries and a `t(key, params)` helper, in the same style as WebVNA.

Layout: on desktop, the inputs sit in a left column and the results and scene on the right. On phone width (16 px gutter, no horizontal scroll), everything stacks in one column.

## Data flow

1. A change to an input saves to localStorage and starts a 300 ms debounce. After that, the request is posted to the worker.
2. Results arrive per step, and the ResultPanel shows a spinner on each step that is still pending.
3. The SceneView animates the path of the selected step.

## Error handling

- Field validation: values must be finite numbers with 0 < value ≤ 2000 cm. An invalid field is outlined with `--err`, and no solve runs until it is fixed.
- An empty route shows the hint "Add a doorway or turn". No solve runs.
- An exception in the worker shows that step as "error: message", and the other steps still run.
- If a solve takes longer than 10 s, the worker is terminated and recreated. The step then shows "timed out, try lower quality".
- If localStorage is unavailable, the app falls back to the defaults silently.

## Testing (Vitest, `src/lib/*.test.ts`)

- **`geometry.test.ts`** — separating-axis cases: separated, touching, overlapping, and a rotated box that overlaps only along a cross-product axis.
- **`solver.test.ts`**:
  - **2D check.** With the ceiling at 10 m, the item flat and `up` fixed, a turn must pass for length L < L_max and fail for L > L_max. Here L_max = min over θ of [a/sinθ + b/cosθ − w/(sinθ·cosθ)], computed numerically, within 2 grid cells of tolerance.
  - **Doorway, small item.** An item smaller than the opening passes with a positive margin.
  - **Doorway, too wide.** An item whose smallest cross-section is larger than the opening fails.
  - **Upright only.** A tall, narrow item passes only with `up` set to its long axis. The orientation label reflects that.
  - **Tilt matters.** A turn case that fails with pitch held at 0 but passes when pitch is free.
  - **Margin sign.** The margin is positive exactly when `fits` is true.
- CI runs `npm run lint`, `npm test` and `npm run build`.

## Repo, CI and GitHub Pages

- A public repo `hermes98761234/furniture-fits-the-corridor`, MIT license, default branch `main`.
- `.github/workflows/ci.yml` runs lint, test and build on pull requests and on pushes to non-main branches.
- `.github/workflows/deploy.yml` (modelled on WebVNA's) runs on pushes to `main`: checkout, Node 22, `npm ci`, lint, test, build, then upload `dist` and deploy with `actions/deploy-pages`. Pages is enabled with source "GitHub Actions".
- Live URL: `https://hermes98761234.github.io/furniture-fits-the-corridor/`.
- **Page decoration:**
  - `index.html` gets a descriptive title and meta description, `theme-color` for light and dark, a canonical URL, Open Graph and Twitter card tags, and a JSON-LD `WebApplication` block.
  - `public/` holds `favicon.svg` (a sofa going around a corner, in the accent colour), `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og-image.png` (1200 × 630), `manifest.webmanifest`, `robots.txt` and `sitemap.xml`.
  - The PNG icons and the OG image are rendered from SVG with a small script in `scripts/`, which is run once and its output committed.
  - The README has a one-line pitch, a live-demo link, a CI badge, a screenshot (`docs/screenshot.png`), a features list, a "how it works" section (pose search, margin) and a quick start.
- The repo description, homepage URL and topics (`furniture`, `moving`, `calculator`, `react`, `vite`, `geometry`) are set with `gh repo edit`.

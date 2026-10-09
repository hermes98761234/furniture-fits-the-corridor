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
- Vite sets `base: './'` (relative asset paths), so the build works under the Pages sub-path.

## Model

All lengths are stored in cm. Display converts to inches when that unit is selected.

```ts
type Item = { length: number; width: number; height: number };
type Settings = { clearance: number; unit: 'cm' | 'in'; lang: 'en' | 'uk'; quality: 'low' | 'medium' | 'high'; theme: 'auto' | 'light' | 'dark' };
type Step =
  | { id: string; kind: 'doorway'; width: number; height: number; wallThickness: number; approachWidth?: number }
  | { id: string; kind: 'turn'; entryWidth: number; exitWidth: number; ceiling: number };
```

- The default clearance is 1 cm. It is added to every face of the item, so each dimension grows by 2 × clearance.
- `approachWidth` on a doorway is the width of the hallway the item comes from. That hallway runs parallel to the wall, so the item has to turn into the door. If it is blank, the approach is open space and the item can be lined up straight.
- A turn has one ceiling height. A doorway's height is its opening. Its ceiling is assumed to be no lower than the opening.

## Solver (`src/lib/`, pure, no DOM)

The solver was prototyped and measured before this spec was finalised; the numbers below are from that prototype.

### `geometry.ts`
- The `Vec3`, `Aabb` and `Obb` types.
- `obbCorners`, `obbBounds` (world bounding box of an oriented box) and `hull2d` (a convex hull, used for drawing).

### `scenes.ts`
`buildScene(step, reach): Scene` returns:
- **`obstacles: Aabb[]`** — wall blocks, the ceiling slab, and the doorway's wall pieces (left of, right of and above the opening). The floor is not an obstacle, because the box always rests on it.
- **`bounds`** — the x and y range of box-centre positions to search.
- **`start: { axis, max, side }`** — the start line. A start pose's bounding box ends at `max` along `axis` and stays on the approach side (`side`) of the other axis. Cells behind the line are skipped, since the approach is open space and adds nothing.
- **`goal: { axis, min }`** — the item is through once its bounding box begins at `min`.
- **Turn:** the entry corridor runs along +x, with y from 0 to the entry width. The exit corridor runs along +y, with x from 0 to the exit width.
- **Doorway:** the wall occupies y ∈ [0, wall thickness], with the opening at x ∈ [0, width] and z ∈ [0, height]. If `approachWidth` is set, a hallway of that width runs along the wall on the approach side. The rooms on either side are taken to be max(door height, 250 cm) tall (marked with a `ponytail:` comment).
- **Standoff:** the start line sits 35 cm before the opening, so a start pose has up to MAX_MARGIN of clearance.

### `solver.ts`
- **Pose:** `{ x, y, yaw, pitch, up }`.
  - `up` is `flat`, `side` or `end`: the smallest, middle or largest item dimension points up.
  - Pitch lifts the longest remaining dimension.
  - Height (z) is not a free variable: the lowest corner rests on the floor. That is always optimal, because lifting only uses up ceiling room.
  - Yaw covers [0, 360°) and wraps. Pitch covers [0, 90°].
  - Roll is not searched: tilting about one axis plus the 3 `up` choices covers how people carry furniture. This is marked with a `ponytail:` comment.
- **Clearance per pose:** for each grid pose, the solver computes in closed form how many cm the box could grow on every face and still clear every obstacle. A negative value is how much it must shrink.
  - This is exact per separating axis. Growing by d adds d·k to the box's projected radius, and lifts its centre by d·(sin p + cos p) because it stays on the floor.
  - The value is clamped to ±MAX_MARGIN, which is 20 cm.
  - The per-orientation constants are precomputed once, so each cell costs only a few multiply-adds.
- **Search:** a widest-path search over the 4D grid (x, y, yaw, pitch), run once for each `up` choice.
  - It uses a bucket queue (0.25 cm buckets, first-in-first-out within a bucket) and returns the start→goal route whose tightest pose has the most clearance.
  - Collision checks are lazy: only cells the search touches are evaluated.
  - The search starts untilted (pitch 0).
  - A search-only penalty of 0.01 cm per degree of tilt sends ties to the less tilted path.
  - Only grid poses are checked, not the sweep between neighbouring poses (marked with a `ponytail:` comment).
- **Margin:** the minimum true clearance along the best path, taking the best of the 3 `up` choices. `fits` is true exactly when margin ≥ 0. A margin of +20 reads "20+ cm to spare" and −20 reads "short by 20 cm or more".
- **Grid:** snapped to whole multiples of the position step, so a cell's position doesn't shift with item size. The grid is the accuracy limit, and margins can under-read by up to about one position step (marked with a `ponytail:` comment).

  | quality | position | yaw | pitch | measured time per step on this machine |
  |---|---|---|---|---|
  | low (Fast) | 4 cm | 7.5° | 15° | 0.1–2 s |
  | medium (Balanced, default) | 3 cm | 6° | 10° | 0.2–7 s |
  | high (Precise) | 2 cm | 5° | 7.5° | 0.4–15 s |

  Open doorways are the slow case, because the whole area in front of the wall is free and gets explored.
- **Output:**
  ```ts
  type StepResult = {
    fits: boolean;
    margin: number;        // cm; >= 0 spare, < 0 short
    up: Up | null;         // working orientation, null if it does not fit
    tilt: number;          // largest tilt along the path, degrees
    path: Pose[];          // empty if it does not fit
    tightestIndex: number; // frame with least clearance
  };
  ```
- **Workers:** each step is solved in its own Web Worker, so the steps run in parallel. A request is `{ item, clearance, quality, step }` and the reply is `{ result } | { error }`. Any input change terminates all running workers and starts fresh ones.

## UI (`src/components/`)

- **`ItemForm`** — the L, W and H fields, clearance, the unit select, the quality select (Fast / Balanced / Precise), the language select and the theme select (System / Light / Dark).
- **`RouteEditor`** — a list of step cards. Each card shows the fields for its type, up/down buttons and a remove button. To change a step's type, remove it and add the other kind. "+ Doorway" and "+ Corridor turn" buttons go at the bottom. The default route is a doorway, then a turn, then a doorway from a hallway, filled with typical apartment sizes.
- **`ResultPanel`** — an overall verdict, then one row per step: ✓ or ✗ (using `--ok` / `--err`), the margin ("Fits with 3.2 cm to spare" / "Doesn't fit: short by 4.1 cm"), and the working orientation ("lying flat, tilted up to 30°"). Clicking a step selects it in `SceneView`.
- **`SceneView`** — a canvas with the plan view on top and the side view below, for the selected step.
  - It draws the walls, the lintel and ceiling, and the item's projected outline. The tightest pose is drawn dashed in `--err`.
  - Play/pause, a scrub slider and a "Tightest point" button move through `path`.
  - It reads its colours from the CSS tokens, so it follows the theme.
- **`i18n.ts`** — in the same style as WebVNA: English source strings are the keys, plus a Ukrainian dictionary and a `tr(lang, s, ...args)` helper with `{0}` placeholders. A test checks that every `t('…')` literal has a Ukrainian entry.

Layout: on desktop, the inputs sit in a left column and the results and scene on the right. On phone width (16 px gutter, no horizontal scroll), everything stacks in one column.

## Data flow

1. A change to an input saves to localStorage. After a 300 ms debounce, each step is posted to its own worker.
2. Results arrive per step, and each step shows "Checking…" until its own result arrives.
3. The SceneView animates the path of the selected step.

## Error handling

- Field validation: lengths must be finite numbers with 0 < value ≤ 2000 cm, and clearance must be 0–20 cm. An invalid field is outlined with `--err` and the verdict says "Fix the highlighted fields". No solve runs until it is fixed.
- An empty route shows the hint "Add a doorway or turn." No solve runs.
- An exception in a worker shows that step as "Error: message", and the other steps still run.
- Each worker has a timeout of 20 s (Fast), 45 s (Balanced) or 120 s (Precise). When it expires, the worker is terminated and the step shows "Timed out. Try a faster quality setting."
- If localStorage is unavailable or holds corrupt data, the app falls back to the defaults silently.

## Testing (Vitest)

- **`geometry.test.ts`** — corners, bounds of a rotated box, and the hull.
- **`model.test.ts`** — unit conversion, field validation, and the storage fallback.
- **`i18n.test.ts`** — placeholder parity between the languages, fallback to English, and every `t('…')` / `N('…')` literal in `src/` having a Ukrainian entry.
- **`solver.test.ts`**:
  - **2D check.** With a 10 m ceiling and the item kept flat, a turn passes at L_max − 15 cm and fails at L_max + 15 cm. L_max = min over θ of [a/sinθ + b/cosθ − w/(sinθ·cosθ)], found numerically.
  - **Doorway, narrower item.** A 70 cm item through an 80 cm opening passes with margin in (3, 5] and no tilt.
  - **Doorway, too wide.** An item wider than the opening in every direction fails with margin < −3 and an empty path.
  - **Upright only.** A tall, narrow item passes with `up = end`.
  - **From a hallway.** A wardrobe turns in through the door from a 100 cm hallway.
  - **Clearance.** Adding 1 cm of clearance lowers the margin by 1 cm (±0.1).
  - **Tilt.** A turn that fails when the item is kept flat passes once tilt is allowed (tilt > 0), and still fails under a 150 cm ceiling.
  - **Margin.** The margin is capped at +20 for a tiny item and −20 for a hopeless one, and margin ≥ 0 exactly when the item fits.
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

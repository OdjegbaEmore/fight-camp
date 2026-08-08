# Fight Camp Tracker — Design System

**Direction 2a — "Modernist × Industry"**
Source: `fight-camp-asset-pack.html` (one level up from this repo, not committed — it's a 676KB self-extracting bundle).

> Red readout on a technical board. Square corners, hairline rules, registration marks,
> condensed labels. The red carries the numbers that matter and the one solid action;
> everything else is line and ink.

The app is **dark-only**. There is no light theme and none is planned — don't add
`prefers-color-scheme` branches.

---

## Color

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#ff563c` | The readout red. Hero figures, active tab, primary action, the one solid fill. |
| `--accent-dark` | `#dd2b0f` | Pressed / active state of a solid accent control. |
| `--ink` | `#201e1d` | App ground (warm near-black). |
| `--deep` | `#0d0c0c` | Recessed surfaces, device bezel, sheet backdrop. |
| `--paper` | `#f8f4f4` | Primary text on the dark ground. |
| `--muted` | `#9b9797` | Labels, units, secondary text. The most-used color in the system. |

Derived lines, always from `--paper` at low alpha — never a new grey:

| Token | Value | Use |
|---|---|---|
| `--rule` | `rgba(248,244,244,0.25)` | Hairline. Cell borders, input borders, dividers. |
| `--rule-heavy` | `rgba(248,244,244,0.4)` | 2px structural break. Tab bar top, section splits. |
| `--rule-faint` | `rgba(248,244,244,0.15)` | Table row separators, skeleton fills. |

**The red is not decoration.** It marks the number that matters on a screen, the active
tab, and the primary action — nothing else. A screen with red in four places has a
hierarchy problem, not a color problem.

## Type

Two faces do all the work. Archivo, Figtree, and Caprasimo ship in the asset pack but
are unused in 2a — don't introduce them.

**Barlow Condensed** — every label, every heading, every large numeral.
- Labels: 12–14px, weight 500–600, `text-transform: uppercase`, `letter-spacing: 0.12em–0.20em`
- Section headings: 24px, weight 600, uppercase, `letter-spacing: 0.04em`
- Hero numerals: 56–94px, weight 600, `line-height: 0.9`, `font-variant-numeric: tabular-nums`
- Cell numerals: 24–32px, weight 600

**Barlow** — body copy, notes, anything sentence-shaped. 13–15px, `line-height: 1.6`.

Loaded from Google Fonts. `sw.js` caches `fonts.gstatic.com` so the typography survives
offline — if you change the font URL, update the service worker too.

Every figure that can be compared column-to-column gets `font-variant-numeric: tabular-nums`.

## Grammar

The details that make it this system rather than a generic dark theme:

- **Square corners.** No `border-radius` anywhere in the UI. The only rounded things are
  the app icon and the phone bezel in mockups.
- **Registration marks.** A box holding a key figure gets a `+` in each corner, in
  `--accent`, offset outside the border (`top:-7px; left:-5px`). Its border is
  `1px solid rgba(255,86,60,0.6)` — accent at 60%, not full. Use sparingly: at most one
  or two per screen, on the figure the screen exists to show.
- **Hairline grids.** Stat groups are a CSS grid with 1px borders between cells, not
  gapped cards. Cells share edges.
- **2px rules** separate major regions. 1px separates peers.
- **Uppercase condensed labels** above every value. The label is `--muted`, the value is
  `--paper` (or `--accent` if it's the number that matters).
- **Progress bars** are a 1px-bordered box with a solid accent fill inset — not a rounded
  track.

## Layout

Four tabs, hash-routed: `#/today`, `#/log`, `#/trend`, `#/camp`.

| Tab | Holds |
|---|---|
| **Today** | Camp day, net deficit hero, weigh-in countdown, 2×2 stat grid, the daily entry form |
| **Log** | Full daily table, newest first, with auto/manual state per row |
| **Trend** | Weight chart, calorie chart, DEXA checkpoints |
| **Camp** | Settings, export, backfill, reset, log out, sync status |

Tab bar is fixed to the bottom, `2px solid var(--rule-heavy)` on top, with
`padding-bottom: env(safe-area-inset-bottom)`. Active item is `--accent`; the rest are
`--muted`.

Inputs must stay at `font-size: 16px` — anything smaller makes iOS Safari zoom on focus.

## Not yet designed

- **Log** and **Camp** tabs appear in the asset pack's nav bar but have no mockup. Their
  current implementation derives from the grammar above rather than a drawn screen.
- **Recipe center** and **Activity breakdown** exist in the pack marked
  *"Template · not wired"* — layout shells with data slots drawn, not filled. Future
  features, not built.
- **App icons** (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) are still the old
  `#c8102e` red. The pack specifies an accent field with an ink "FC" in Barlow Condensed
  600 and a single registration tick, at 1024 / 192 / 76px. These need regenerating.

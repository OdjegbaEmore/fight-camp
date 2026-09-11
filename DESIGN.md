# Fight Camp — Design System

**Direction 3b — "softened"**
Source of record: `Fight Camp App.dc.html` in the `design_handoff_fight_camp_tracker` bundle
(19 screens, five tabs, both Today modes), with `Fight Camp Asset Pack.dc.html` as the
component vocabulary behind it.

> Dark ground, warm coral accent, soft-cornered cards over hairline rules. The accent carries
> live values, the active state, and exactly one primary fill per screen.

The app is **dark-only**. There is no light theme and none is planned — don't add
`prefers-color-scheme` branches.

---

## ⚠ This supersedes Direction 2a (2026-09-11)

Everything before this was **Direction 2a, "Modernist × Industry"** — accent `#ff563c`, ink
`#201e1d`, and *square corners everywhere*. The 3b handoff replaced all of it. There are zero
occurrences of the 2a palette in the design of record.

If you find 2a values or square-corner rules anywhere in the codebase, they are **leftovers to
migrate, not a second valid style.** The two cannot be mixed: 2a's hard corners next to 3b's
6px cards reads as a rendering bug rather than a choice.

---

## Color

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#262221` | Screen background; text *on* accent fills |
| `--paper` | `#e7e1df` | Primary text on the dark ground |
| `--muted` | `#a5a09d` | Secondary text, labels, empty values. The most-used color. |
| `--accent` | `#ef7059` | Live values, active state, one primary fill per screen |
| `--accent-hover` | `#d95c45` | Primary button hover / pressed |
| `--bezel` | `#0d0c0c` | Device bezel — **design-board scaffolding only, never built** |

Derived lines and fills, always from `--paper` at low alpha — never a new grey:

| Token | Value | Use |
|---|---|---|
| `--line` | `rgba(248,244,244,0.16)` | Card borders, dividers |
| `--line-soft` | `rgba(248,244,244,0.1)` | List row rules |
| `--line-bar` | `rgba(248,244,244,0.18)` | Progress bar outline |
| `--rule` | `rgba(248,244,244,0.14)` | Pull-quote rules |
| `--surface` | `rgba(248,244,244,0.03)` | Card fill |
| `--accent-line` | `rgba(239,112,89,0.38)` | Accent card border |
| `--accent-surface` | `rgba(239,112,89,0.06)` | Accent card fill |

**The accent is not decoration.** It marks live values, the active tab or segment, and the
single primary action. A screen with coral in five places has a hierarchy problem.

## Type

**Barlow Condensed** — all labels, numerals, titles.
**Barlow** — body copy, notes, anything sentence-shaped.
Google Fonts, weights 400/500/600/700. `sw.js` caches `fonts.gstatic.com`; if the font URL
changes, update the service worker too.

| Role | Spec |
|---|---|
| Screen title | Barlow Condensed 24 / 600 / 0.005em |
| Section eyebrow | Barlow Condensed 12 / uppercase / 0.1em / muted |
| Hero numeral | Barlow Condensed 52–92 / 600 / tabular-nums |
| Card numeral | Barlow Condensed 24–30 / 600 / tabular-nums |
| List item title | Barlow Condensed 17 / 0.01em |
| Focus title | Barlow Condensed 26–34 / 600 |
| Body | Barlow 12.5–15.5 / line-height 1.5 |
| Pull quote | Barlow 21 / line-height 1.32 |
| Footnote | Barlow 11–12 / muted |
| Tab label | Barlow Condensed 13 / 0.07em |

Every numeral gets `font-variant-numeric: tabular-nums`.

## Grammar

- **Soft corners.** 6px cards and buttons, 8px accent/framed cards, 99px pills, 3px progress
  bars. (2a's "no radius anywhere" rule is dead — see the supersede note.)
- **Register marks.** Accent cards carry four small `+` marks in `rgba(239,112,89,0.8)`,
  absolutely positioned outside the border (top/bottom −7/−8px, left/right −5px, 12px).
  Sparingly — on the card the screen exists to show.
- **1px borders throughout. No shadows anywhere.**
- **Uppercase condensed eyebrow** above values. Eyebrow `--muted`, value `--paper`, or
  `--accent` when it's the number that matters.
- **Progress bars** are a 1px-bordered box with an inset accent fill: 6px tall / 4px fill on
  breakdown rows, 8px / 6px fill on weigh-in.
- **Segmented controls** single-select; active segment filled `--accent` with `--ink` text at 600.
- **Buttons.** Primary = `--accent` fill, `--ink` text, radius 6, Barlow Condensed 15/600,
  0.06em, `padding: 12px 0`. Ghost = 1px `--line`, `--surface` fill, `--paper` text, hover
  border+text `--accent`.

## Spacing

Scale: 4 / 6 / 9 / 12 / 18 / 22px. Screen padding `16–18px 22px`. Column gap 9px on dense
screens, 18px on off-season Today. Card padding `9–16px 13–18px`. List rows `10–11px 0`.

## Layout

Five tabs, bottom bar always visible: **Today · Train · Fuel · Progress · More**.
Active `--accent`, inactive `--muted`. Bar has a 1px top border `--line` and
`padding: 12px 16px 30px` (bottom = home indicator; use `env(safe-area-inset-bottom)`).

| Tab | Screens |
|---|---|
| **Today** | Off-season · Fight camp mode |
| **Train** | Templates · Builder · Session runner · Myzone history · Reservations · Tips library |
| **Fuel** | Food diary · Add food · Cookbook · Recipe detail · Meal plans |
| **Progress** | Weight & DEXA · Calories · Camp mode |
| **More** | News feed · Article reader · Settings |

**Two modes.** Off-season Today is a training companion (weekly focus, quote, next session,
breakdown). Fight Camp Mode adds the weight-cut telemetry — net deficit hero, weigh-in
progress, 2×2 metric grid. **Those never render outside camp mode** (`campMode.active`).

Inputs must stay at `font-size: 16px` — smaller makes iOS Safari zoom on focus.
Touch targets: 36px in the mocks, **44px in the build**.

## Deliberately cut — do not reintroduce

Confirmed by the user 2026-09-11:

- **Class booking.** No Book button, no booking screen. Reservations is read-only.
- **Barcode scanning** in Add Food. Favourites and Search only.
- **Perkville rewards**, anywhere, including the Settings connections list.

## Added back after the handoff

- **Weigh-in entry.** The handoff has no way to log a weight — 19 screens, all read-only.
  Per the user (2026-09-11) this lives as a **button on Progress**, opening the entry control.
  Carry over the current build's ±0.5 stepper and `Prev X · Δ ±Y` readout; it's the
  interaction already in daily use.

## Scaffolding — never build

The `.dc.html` boards are canvas-style: 390×844 phone frames side by side with bezels, fake
status bars, headings, captions and badges. Build only what's inside each 370×824 screen,
minus the status bar.

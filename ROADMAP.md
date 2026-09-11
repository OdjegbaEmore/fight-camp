# Fight Camp → Boxing Everything App — Build Roadmap

**Updated:** 2026-09-11, against the `design_handoff_fight_camp_tracker` bundle.
`DESIGN.md` is the visual spec (now Direction 3b). `SESSION_NOTES.md` (local-only) is the
running handoff log.

Nineteen screens, five tabs: **Today · Train · Fuel · Progress · More**.

---

## Settled decisions

**Cut, confirmed 2026-09-11 — do not reintroduce:**
- **Class booking.** Archetype runs on Mariana Tek, whose booking API is partner-gated
  (partner survey, signed Developer ToS, 1–3 week review — granted to businesses, not
  members). Reservations is read-only. Booking stays in the gym's own app.
- **Barcode scanning.** Add Food is Favourites + Search only.
- **Perkville rewards**, everywhere including Settings.

**Added back:** the handoff has no weigh-in entry anywhere. It lives as a **button on
Progress**, reusing the current ±0.5 stepper and `Prev X · Δ ±Y` readout.

**Design direction changed** from 2a to 3b — see the supersede note in `DESIGN.md`.

**Keep the existing stack.** Vanilla PWA, no build step, `git push` deploys to GitHub Pages,
Supabase behind it. The handoff README suggests React+Vite or Expo "if no environment
exists"; one exists and works. Do not rewrite.

---

## Ground truth (verified 2026-09-11, not the mockup numbers)

The design was drawn from `source-data/` files that **end 2026-08-01** and contain only the
June DEXA scan. It therefore shows "Myzone not connected", "pending sync", 30.9% body fat and
a demo gym schedule. **None of that is true. Do not build those empty states — they are a
regression.**

| | Mockup says | Actually |
|---|---|---|
| Weight | 269.0 | **258** (2026-09-11) |
| Body fat | 30.9%, June scan only | **27.5%**, two scans (Jun 18 + Aug 31) |
| Myzone | "not connected" | **Connected**, syncing twice daily |
| Sessions | one, 31 Jul | full history, current through today |
| Gym | "Demo schedule", Coach Ruiz | Archetype Boxing / Saturday Boxing / Boxing Ring Class; Jeremy C, Tyson Mendeas, Sean Apperson |

Keep the layouts, swap in real data. Real empty states (news before first fetch, an
un-built template list) still get the handoff's "— —" treatment.

---

## Phase 1 — Structural (no new features)

Ends with the app behaving exactly as today, on a shape that can hold nineteen screens.

1. **Split `index.html` into ES modules** — `<script type="module">`, no bundler.
   `js/state.js`, `js/data.js`, `js/views/*.js`. Bump `sw.js` to v5 and precache the list.
2. **Five-tab IA** — retire `#/log`, add `#/train`, `#/fuel`, `#/progress`, `#/more`.
3. **Re-skin to 3b tokens** — every 2a value migrated in one pass. Mixing the two looks broken.
4. **Camp becomes a mode** — `campMode {active, name, startDate, endDate, targetWeight,
   dayIndex, dayCount}`. Off-season Today hides all weight-cut telemetry.
5. **Weigh-in entry moves to Progress** as a button + sheet.

**Risk:** this touches every line of a working app the user depends on daily. Do it on a
branch, verify against live data, merge when Today/Progress render correctly.

## Phase 2 — Train

6. **Templates + Builder** — `workout_templates` table; rounds as ordered JSON. Drag to reorder.
7. **Session runner.** ⚠ **The one real technical risk.** The spec requires the timer to survive
   a locked screen; iOS Safari suspends JS timers in a backgrounded PWA. Build wall-clock
   style: persist `startedAt`, compute elapsed on resume, drive round changes with scheduled
   audio + vibration. Never trust `setInterval` to have ticked. Prototype this *first* — if it
   can't be made reliable, the screen needs redesigning around it.
8. **Myzone history** — already-synced data, with the segmented 30 days / Camp / All.

## Phase 3 — Fuel

9. `food_log` + `foods` tables; diary day view; Favourites and Search (USDA FoodData Central
   / Open Food Facts, both free).
10. **Plan autofill** — `source: 'plan' | 'manual' | 'recipe'` drives the per-item `×` and
    Clear plan. Undo, not a confirm dialog.
11. **Cookbook + Meal plans** — seed from `Fight_Camp_Meal_Plan_v2.docx` (active: 1,513 kcal /
    169 g protein) and `Ring_Training_Dinner_Plan.docx`.
12. **Migrate `extra_cal`** — the diary becomes the intake source. Historical rows keep their
    typed value as one "legacy entry" line item so the deficit history stays intact.

## Phase 4 — Progress + More

13. Weight & DEXA, Calories, Camp mode screens — mostly existing logic, re-skinned.
14. **News** — RSS can't be fetched from the browser (CORS). The existing local scheduled task
    fetches server-side into a `news` table; the app reads rows. Gives offline reading free.
15. **Tips library** — `content` table, 42 tips / 6 categories. Also feeds the weekly focus
    card and the daily rotating quote.

## Phase 5 — Archetype (read-only)

16. **`reservations` table** parsed from Gmail — `danielle@archetypeboxing.com` sends
    `You reserved {class} at {time} on {date}!` and `Reservation Cancelled: {time} {class}`.
    Cancellation supersedes the booking it matches on (date, time).
17. **Auto-fill `workouts.name`** — match a Myzone session to a reservation on date + *nearest*
    start time. All synced sessions currently have `name: null`, so this is pure gain.
    - Fuzzy window: observed start times run up to ~25 min off the scheduled class.
    - Resolve to the **nearest** class — back-to-back 5:30/6:30 bookings are common.
    - **The Myzone sync itself must still never write `name`.** Separate reconciliation step,
      and it must not overwrite a user-typed label.
18. Reservations screen, read-only. Deep link *out* to the gym's schedule is allowed
    (`.../schedule?_mt=%2Fschedule%2Fdaily%2F48541%3FactiveDate%3DYYYY-MM-DD%26locations%3D48717`)
    but there is **no Book button** — see cuts.

---

## What needs the user, and when

Everything else can be built unattended.

| # | Needs you | When | Why |
|---|---|---|---|
| 1 | **Run SQL in the Supabase dashboard** for each new table | Start of phases 2, 3, 4, 5 | Schema changes need dashboard access |
| 2 | **Approve the Phase 1 merge** | End of phase 1 | It re-skins and restructures an app in daily use |
| 3 | **Supply or approve content** — 42 tips, 6 categories, the quote list, news sources | Phase 4 | Taste, not engineering. I can draft; you pick |
| 4 | **Confirm camp-mode semantics** | Phase 1 | What "archive" does to old camps; whether off-season keeps a rolling weight chart |
| 5 | **Decide the session-runner fallback** | Phase 2, after the prototype | Only if the locked-screen timer proves unreliable on your phone |

## Known-good state (don't re-derive)

- Supabase `service_role` key works (re-verified 2026-09-11; the 2026-09-05 401 was transient).
- Myzone sync is healthy and current — local scheduled task, noon + 9pm.
- `entries`, `workouts`, `dexa_scans`, `settings` tables live; two DEXA scans present.
- `extra_cal` has been 0 for weeks — the user stopped logging food, which is most of why
  the diary matters.

## Outstanding from the old list

- Jul 18/19/20 all read 264.0 between 273 and 275 — almost certainly 274 mistyped. Needs a ruling.
- App icons still the retired 2a red `#c8102e`; now need the 3b `#ef7059`.
- Three redundant manual locks (Aug 01/02/06) could be released to auto.

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

## Phase 1 — Structural ✅ built 2026-09-11, on `phase-2-timer-prototype`, **not merged**

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

## Phase 2 — Train ✅ built 2026-09-11, on `phase-2-timer-prototype`, **not merged**

6. **Templates + Builder** — `workout_templates` table; rounds as ordered JSON. Drag to reorder.
7. **Session runner.** ✅ **Feasibility settled 2026-09-11** — prototyped on a real iPhone
   (iOS 26.6.1) via `prototype-timer.html`. Timing is exact, the screen stays awake and cues
   sound. No redesign needed. Four rules came out of it and all four are load-bearing:
   - **Never accumulate time.** One epoch timestamp; recompute from `Date.now()` every
     repaint. Verified across 41.8s backgrounded over two locks — every boundary after
     resume landed exactly on time. Timers ran through one lock and were suspended through
     the next, which is precisely why they can't be trusted.
   - **Null the wake lock in its `release` handler**, or the re-acquire guarded by
     `!wakeLock` never fires. Cost 18 seconds of held lock out of 110 in the first run.
   - **Unlock audio inside the Start gesture** — `resume()` plus a silent 1-frame buffer.
     Creating the context there is not enough; iOS returns it suspended.
   - **Treat any non-`running` state as needing a resume.** iOS parks the context in
     `interrupted`, not only `suspended`.

   A round timer you cannot hear is useless on a bag, so cues are load-bearing and the
   screen staying on is load-bearing: the runner must warn visibly when the lock is lost.
8. **Myzone history** — already-synced data, with the segmented 30 days / Camp / All.

## Phase 3 — Fuel ✅ built 2026-09-12, on `phase-2-timer-prototype`, **not merged**

9. `food_log` + `foods` tables; diary day view; Favourites and Search (USDA FoodData Central
   / Open Food Facts, both free).
10. **Plan autofill** — `source: 'plan' | 'manual' | 'recipe'` drives the per-item `×` and
    Clear plan. Undo, not a confirm dialog.
11. **Cookbook + Meal plans** — seed from `Fight_Camp_Meal_Plan_v2.docx` (active: 1,513 kcal /
    169 g protein) and `Ring_Training_Dinner_Plan.docx`.
12. **Migrate `extra_cal`** — the diary becomes the intake source. Historical rows keep their
    typed value as one "legacy entry" line item so the deficit history stays intact.

## Phase 4 — Progress + More ⏳ not started (needs content authored — 42 tips, quotes, news sources)

13. Weight & DEXA, Calories, Camp mode screens — mostly existing logic, re-skinned.
14. **News** — RSS can't be fetched from the browser (CORS). The existing local scheduled task
    fetches server-side into a `news` table; the app reads rows. Gives offline reading free.
15. **Tips library** — `content` table, 42 tips / 6 categories. Also feeds the weekly focus
    card and the daily rotating quote.

## Phase 5 — Archetype (read-only) ✅ built, migrated, backfilled and syncing 2026-09-12 · UI **not merged**

**Live now, ahead of the merge:** `supabase-phase5.sql` is run; 106 reservations and 46
session names were backfilled (13 Jul → 12 Sep); the `archetype-reservation-sync` local
scheduled task runs at 12:30 and 21:30. The session names already show in the **deployed**
app's Today breakdown, which reads `workouts.name`. The Classes pane and Next session card
wait for the merge like everything else. To undo the names:
`update workouts set name = null, name_auto = null where name = name_auto;`

Checked against every Archetype email and every Myzone session since camp start (139
emails, 76 sessions). Two of the original assumptions did not survive the real data —
both are marked ⚠ below, and the code is the authority on both.

16. **`reservations` table** (`supabase-phase5.sql`), one row per class holding its
    *current* state. `danielle@archetypeboxing.com` sends:
    - `You reserved {class} at {time} on {M/D/YYYY}!` — body adds the instructors.
    - `Reservation Cancelled: {time} {class}` — ⚠ **the subject has no date**; the body does
      (`Your reservation for {class} on {M/D/YYYY} at {time} has been cancelled`).
    - `Receipt` with `Sales|Refund Receipt … No Show Fee {class} - {Mon D, YYYY}, {time}` →
      `no_show`, reversed by the refund.

    ⚠ **The newest email wins — a cancellation does not simply supersede its booking.**
    Classes get rebooked, sometimes repeatedly: Saturday Boxing on 5 Sep went booked,
    cancelled, booked, cancelled; 3 Sep's 7:15 was cancelled and rebooked 49 seconds later.
17. **Auto-fill `workouts.name`.**
    - ⚠ **Match on overlap, not nearest start time.** A session is credited with every booked,
      non-no-show class it overlaps by ≥ 20 min (classes run 60). Nearest-start fails three
      ways in the data: the strap goes on up to 35 min early (20 Aug); one session often
      spans back-to-back classes (9 Sep, 06:29 for 114 min = the 6:30 *and* the 7:30); and
      28 Aug's 17:48 session is nearest the 5:30 the gym charged a no-show for, but runs to
      18:55 — it was the 6:30.
    - Names read `Archetype Boxing ×2`, `Saturday Boxing + Boxing Ring Class`; the gym's
      `(Coach Approval Required)` suffix is dropped for display only.
    - **Ownership via `workouts.name_auto`.** The step writes `name` only while it is NULL or
      still equals `name_auto` (what the step last wrote). A label typed in any build — the
      live app included, which knows nothing of `name_auto` — differs and is never touched.
      A cleared name is `''`, not NULL, so it stays cleared. Writes are guarded on the value
      read, so a retype between read and write matches zero rows.
    - **The Myzone sync still never writes `name` or `name_auto`.** Unchanged.
    - Dry run: 46 of 76 sessions named, all 11 user-typed names left alone, no false matches
      found in the 22 unmatched (all are unbooked bike rides and Sunday sessions).
18. **Classes pane** on Train (a fourth segment), plus the **Next session** card on Today.
    Read-only; deep link *out* to the gym's schedule, **no Book button** — see cuts.

**Where the logic lives.** `tools/archetype_sync.py` — Python 3.9 stdlib, because this Mac
has no Node. A scheduled task does the Gmail search (only it has the connector), writes the
messages to JSON and runs the script; the script parses, resolves, upserts and names. The
app reads rows only, so `js/archetype.js` is display logic and nothing is implemented twice.
This is also the shape the parked GitHub Actions port of the Myzone sync wants.

---

## Status — 2026-09-12

**Branches.** `main` is the live four-tab app plus `prototype-timer.html`.
`phase-2-timer-prototype` is the cumulative working branch holding Phases 1+2+3+5 — the
name is historical, work continues there. All three branches are pushed.

**Nothing is merged.** The app on the user's phone is unchanged.

**Merge on/after 2026-09-18**, when camp ends. Held deliberately: the off-season path is
half of what was rebuilt and cannot be exercised while camp mode masks it, and a full
restructure should not land mid-cut.

**Migrations run:** `supabase-phase1.sql`, `supabase-phase2.sql`, `supabase-phase3.sql`,
`supabase-phase5.sql` — all applied to the live database. All additive; the deployed app
reads none of the new tables (it does read `workouts.name`, which Phase 5 now fills).

**Not yet verified:** the Supabase round-trip for Phases 2–3. Everything was checked
against injected state with writes stubbed, so saving a template, logging food and seeding
the cookbook have never actually hit the database. First thing to confirm after merging.

**Written but deliberately not run:** `migrateExtraCal()` in `js/data.js`. It preserves
each historical day's typed `extra_cal` as one diary line so the camp's deficit history
survives the diary becoming the intake source. Run it with the user present — it touches
85 days.

---

## Camp mode — settled 2026-09-11

**Live state:** `camp_start` 2026-07-13, `camp_end` **2026-09-18**, `rmr` **2067**,
`base_cal` 1500. Camp is *active*, not over — it was extended past the original 2026-08-31.

### Camps are first-class records

New `camps` table: `id, name, start_date, end_date, target_weight, archived, results_json`.
`settings.camp_start` / `camp_end` are migrated into the first row (name it
"Summer Fight Camp 2026") and then retired. `campMode.active` is derived: a camp exists,
is not archived, and today falls within its dates.

Archive behaviour follows the handoff copy — a camp's logs and charts go read-only, while
the diary and training history stay in the main timeline.

### Baseline: most recent camp's start ⚠ reverses an earlier decision

"Real total weight loss" counts from **the start of the most recent camp**, not from the
first-ever weigh-in.

`SESSION_NOTES.md` records the opposite ("Baseline is the first logged weigh-in (283.0,
Jul 13), NOT the DEXA weight — the user chose this explicitly; don't 'fix' it back").
**That instruction is superseded.** It was reaffirmed and then changed on 2026-09-11.

Today the two agree by coincidence — `camp_start` (2026-07-13) is also the first weigh-in
date, so both read 283.0 and the hero shows −25 lb. **They diverge at camp 2**, which will
baseline against its own start weight and begin at 0.

### Off-season: rolling 90-day window

Outside camp, the weight chart shows the last 90 days rather than camp-scoped or all-time.
Six weigh-ins have been logged since 2026-09-01 and currently render nowhere, because
`weighedDatesBetween(campStart, campEnd)` scopes everything to the camp window.

### RMR stays global — with one known consequence

One `rmr` in settings, not per-camp. Chosen deliberately over per-camp storage.

**Consequence to accept:** `burnFor()` applies the current RMR to every day ever logged, so
any future DEXA scan retroactively changes the deficit history of past camps. This already
happened once — 2138 → 2067 on this camp.

**Mitigation that respects the choice:** snapshot each camp's *computed results* (total
loss, average deficit, day count) into `camps.results_json` at archive time. RMR stays
global and live; archived camp results stop moving. Recommended, not yet approved.

---

## What needs the user, and when

Everything else can be built unattended.

| # | Needs you | When | Why |
|---|---|---|---|
| 1 | **Run SQL in the Supabase dashboard** for each new table | Start of phases 2, 3, 4, 5 | Schema changes need dashboard access |
| 2 | **Approve the Phase 1 merge** | End of phase 1 | It re-skins and restructures an app in daily use |
| 3 | **Supply or approve content** — 42 tips, 6 categories, the quote list, news sources | Phase 4 | Taste, not engineering. I can draft; you pick |
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

# Fight Camp → Boxing Everything App — Roadmap

**Written:** 2026-09-08. Supersedes nothing; `DESIGN.md` remains the visual spec and
`SESSION_NOTES.md` (local-only) remains the running handoff log.

The app is being widened from a single-purpose camp tracker into a general boxing app:
news, training tips, weekly focus, custom workouts, food diary, cookbook, and gym-session
booking.

## Decisions already made (2026-09-08)

- **Food diary is the source of truth for intake.** The diary sums into the daily figure;
  `entries.extra_cal` becomes derived rather than hand-typed. Existing camp history must
  be migrated, not orphaned.
- **Food diary is barcode + database backed** — Open Food Facts for packaged goods, USDA
  FoodData Central for whole foods. Both free.
- **Gym booking is read-only tracking, not in-app booking** (confirmed 2026-09-10). The
  gym is Archetype Boxing Club Austin on Mariana Tek, whose booking API is partner-gated.
  Booking stays in the Archetype app; we parse the reservation emails. See Phase 5.

## The structural work that gates everything else

Two changes have to land before feature work, or every feature after them pays interest.

### 1. Split the single file into ES modules

`index.html` is 1,537 lines with all logic in one trailing `<script>`. Seven more
features puts it past 5,000. Split into native ES modules loaded with
`<script type="module">` — **no bundler, no build step, `git push` still deploys.**
That constraint is non-negotiable; it's what makes this project maintainable by one
person.

Proposed shape:

```
index.html          shell, nav, view containers
js/state.js         state object, Supabase client, auth
js/data.js          load/upsert/delete, realtime subscriptions
js/views/today.js
js/views/log.js
js/views/trend.js
js/views/train.js   custom workouts + activity breakdown
js/views/fuel.js    food diary + cookbook
js/views/read.js    news + tips + weekly focus
js/views/camp.js    settings, export, backfill
```

`sw.js` must precache the new module list, and its cache name bumps to `v5`.

### 2. Rework the information architecture

Four tabs cannot hold ten features. Proposed five:

| Tab | Holds |
|---|---|
| **Today** | Dashboard: weekly focus, today's numbers, next session |
| **Train** | Custom workouts, session runner, per-session breakdown |
| **Fuel** | Food diary, cookbook, meal plans |
| **Progress** | Weight/calorie charts, DEXA, camp mode |
| **More** | News, tips, settings, export, sync status |

Related: **camp becomes a mode, not the app.** `campStart`/`campEnd` currently scope the
whole Trend tab and the Today header. With camp over (2026-08-31), those need to degrade
to an "off-season" state and support starting a *new* camp window without losing history.

## Screen inventory (for mockups)

Settled 2026-09-10. **`DESIGN.md` still governs every pixel** — dark-only, `#ff563c` used
only for the one number that matters plus the single primary action, square corners,
hairline grids, Barlow Condensed labels, registration marks used sparingly. New screens
inherit that grammar; none of it is up for renegotiation here.

Legend: **[E]** exists today · **[N]** new · **[X]** exists but changes

### Today — the dashboard
- **[E]** Camp header + net-deficit hero
- **[X]** Camp header gains an **off-season state** (camp is now a mode, not the app)
- **[E]** Weigh-in progress bar
- **[E]** 2×2 metric grid — Mass, Real total weight loss, Today's intake, Calories burned
- **[N]** **Weekly focus** card
- **[N]** **Next session** card — class name, time, coach, + deep link to that day
- **[N]** **Perkville** tile — points balance, monthly bonus progress ("11 of 12, 21 days left")
- **[X]** Per-session training breakdown — now auto-named from reservations
- **[E]** Sync status

### Train
- **[N]** Custom workout **template list**
- **[N]** Workout **builder** — rounds, exercises, durations
- **[N]** Session **runner** with round timer
- **[X]** Session history (Myzone), names auto-filled
- **[N]** **Reservations** list — upcoming and past
- **[N]** **Book a class** button → date-targeted deep link
- **[N]** Training tips library

### Fuel
- **[N]** Food diary day view — line items, running total, macros
- **[N]** Add food — favourites / search / barcode scan
- **[N]** **Cookbook** list + recipe detail *(asset pack's "Recipe center" is the drawn screen)*
- **[N]** Meal plans, seeded from `Fight_Camp_Meal_Plan_v2.docx` and `Ring_Training_Dinner_Plan.docx`

### Progress
- **[E]** Weight chart, calorie chart, Rate, Logged count
- **[E]** DEXA checkpoints table + Lean mass tile
- **[N]** **Camp mode** control — start / end / archive a camp window

### More
- **[N]** **News** feed + article reader
- **[E]** Settings (RMR, base calories, camp dates)
- **[E]** Export CSV, Import backfill, Reset cloud data, Log out

### The open design question — where does daily entry go?

Today's **Log** tab is the entry surface: date, weigh-in stepper, extra-calorie chips,
training readout, notes, Commit entry, Delete day.

The food diary takes over `extra_cal`, which was most of that screen's reason to exist.
What's left is **weigh-in + notes** — not enough for a tab, and it costs the fifth slot
that News/Train needs.

**Proposal to mock up: a "Log today" sheet**, opened from Today rather than living in the
tab bar. Weigh-in stepper, notes, commit, delete. Keeps the one-tap-from-Today speed that
made the current Log good, without spending a tab on it.

This is the one structural decision not yet settled. Worth drawing both ways.

## Phases

### Phase 0 — housekeeping (do first, small)

- Push commit `2bed5e8`. Until then the live Lean mass tile shows June's figures.
- Resolve the open data questions in `SESSION_NOTES.md`: the Jul 18/19/20 `264.0` triple,
  the three redundant manual locks, the missing 2026-08-31 weigh-in.
- Regenerate app icons off the `#c8102e` red (outstanding since 2026-08-04).

### Phase 1 — structural

Module split + IA rework + camp-as-mode. No new features. Ends with the app behaving
exactly as it does now, on a shape that can absorb the rest.

### Phase 2 — the easy wins

Highest value per unit of work, all self-contained:

- **Custom workouts.** `workouts_templates` table: named session, list of rounds/exercises,
  duration. Runner screen with a round timer. Feeds the existing `workouts` table on
  completion.
- **Cookbook.** `recipes` table. **Seed from the user's own documents** —
  `Fight_Camp_Meal_Plan_v2.docx` and `Ring_Training_Dinner_Plan.docx`, one level up.
  The asset pack's **"Recipe center"** template is the drawn screen for this; wire it.
- **Weekly focus + training tips.** `content` table, typed rows. Rendered on Today.

### Phase 3 — food diary

The largest single piece. Order matters:

1. `foods` (cached lookups) and `food_log` (date, item, qty, kcal, macros) tables.
2. Manual + favourites entry path first — this is what gets used daily.
3. Database search against Open Food Facts / USDA.
4. Barcode scan last. Safari ships no `BarcodeDetector`, so this needs a JS scanner
   library over `getUserMedia`. Treat as a nice-to-have, not the foundation.
5. Migrate `extra_cal`: historical camp rows keep their typed values as a single
   "legacy entry" line item so the deficit history stays intact.

### Phase 4 — news

Browsers cannot fetch third-party RSS directly; CORS blocks it. **Fetch server-side, store
rows, app reads rows.** The existing local scheduled task already does exactly this shape
of work for Myzone and is proven reliable — extend it rather than inventing a second
mechanism. Weekly/daily cadence is far more tolerant of a sleeping Mac than the twice-daily
calorie sync is.

Also gives offline reading for free, which a live feed would not.

### Phase 5 — Archetype integration (was "gym booking")

**Confirmed 2026-09-10.** The gym is **Archetype Boxing Club, Austin** (2700 W Anderson Ln
Suite 203). Their iOS app is a white-label build on **Mariana Tek** (© Mariana Tek
Corporation, now Xplor Mariana Tek).

#### Booking itself: not available to us

Mariana Tek does publish a **Customer API** that can list classes and create reservations
— but access is gated behind a partner survey, a signed Developer Tools ToS, and a 1–3
week technical review, granted to businesses rather than members. As a member, that door
is closed. Do not plan around it.

**Booking stays in the Archetype app.** The app's job is a deep-link button into it, not a
replacement for it.

#### Everything *around* booking: yes, and it's already in the inbox

Gmail confirms a clean, parseable stream. This reuses the proven Myzone pipeline exactly —
no new mechanism, no credentials, no ToS problem.

| Source | Sender | Carries |
|---|---|---|
| Reservation confirmed | `danielle@archetypeboxing.com` | Class name, coaches, time, full date — in both subject and body |
| Reservation cancelled | `danielle@archetypeboxing.com` | Class name, time, date |
| Loyalty points | `no-reply@perkville.com` | Points earned, running balance, monthly bonus progress |

Subject lines alone are nearly sufficient:
`You reserved Saturday Boxing at 9:00 AM on 9/12/2026!` and
`Reservation Cancelled: 6:30 PM Archetype Boxing`.

Known class names so far: **Archetype Boxing**, **Saturday Boxing**, **Boxing Ring Class
(Coach Approval Required)**. Known coaches: Jeremy C, Tyson Mendeas, Sean Apperson.

Build:

1. **`reservations` table** — date, time, class_name, coaches, status (booked/cancelled).
   Parse confirmations and cancellations; a cancellation supersedes the booking it matches
   on (date, time). Same resend/supersede discipline as the Myzone dedup.
2. **"Next session" on Today** — the upcoming reservation, with class name and coach.
3. **Deep link to the Archetype app** for actual booking, from the Train tab.
4. **Perkville tile** — points balance and the monthly bonus progress bar (e.g. "11 of 12
   classes, 21 days left"). This is a ready-made motivation layer already being emailed
   and currently going unread.

#### The prize: auto-filling `workouts.name`

`DESIGN.md` and `SESSION_NOTES.md` both record that Myzone supplies **no activity name**,
so `workouts.name` is hand-typed. The reservation emails supply exactly that missing field.

Match a Myzone session to a reservation on **date + nearest start time**, then write the
class name. Two cautions:

- **Use a fuzzy window, not an exact match.** Observed check-in and session-start times run
  up to ~25 minutes off the scheduled class time.
- **Back-to-back classes are common** (5:30 PM and 6:30 PM the same evening), so the window
  must resolve to the *nearest* class, not the first within range, or sessions get
  mislabelled.
- **The existing rule still holds: the Myzone sync must never write `name`.** This is a
  separate reconciliation step, and it must not overwrite a name the user typed by hand.

#### Web booking portal — found (2026-09-10)

The gym's `/schedule` page embeds the Mariana Tek widget from
**`archetype.marianaiframes.com`** (tenant slug `archetype`) and routes it through an
`_mt` query parameter. **The deep link is date-targetable**, which makes it a far better
button than "open the app":

```
https://www.archetypeboxing.com/schedule?_mt=%2Fschedule%2Fdaily%2F48541%3FactiveDate%3DYYYY-MM-DD%26locations%3D48717
```

- `48541` — schedule id
- `48717` — location id (Austin)
- `activeDate` — plain `YYYY-MM-DD`, verified landing on the requested day

So a "Book a session" control can open **the specific day** the user is looking at —
tomorrow, or the gap the app notices in their week.

#### What the Mariana Tek API will and won't give us

Tenant API base is `https://archetype.marianatek.com/api` (the host's root 404s; only
`/api/*` responds). Probed 2026-09-10:

| Endpoint | Result |
|---|---|
| `/api/locations` | **200, unauthenticated** — confirms location `48717` "Austin", `US/Central` |
| `/api/regions`, `/api/sites` | **200, unauthenticated** |
| `/api/class_sessions` | **401** — `Authentication credentials were not provided.` |
| `/api/classes`, `/api/class_types`, `/api/instructors` | 404 — not routes on this tenant |

The class schedule lives behind `/api/class_sessions`, and it is deliberately
authenticated. The public widget clearly holds some credential to read it.

**Do not extract that credential.** It would mean circumventing an access control Mariana
Tek put there on purpose and gates behind a signed Developer ToS — and practically it
would be a hardcoded secret that dies silently on their next rotation, leaving a blank
schedule in the app with no error. The deep link plus the reservation-email parser gets
essentially the same user-facing result on entirely solid ground.

**If a live in-app class list is ever genuinely wanted**, the legitimate route is the gym
asking Mariana Tek for API credentials on their own account — Archetype is the customer,
and that is a conversation to have with the gym, not a problem to solve in code.

## Cost

Stays at $0. GitHub Pages plus Supabase free tier (500MB database, 1GB storage) covers all
of the above. Recipe and meal photos are the only thing that could pressure storage;
compress on upload.

## Deliberately out of scope

The app describes and logs; it does not prescribe. Curated training tips and recipes are
content. Individualised training loads or weight-cutting targets are not something this
app should generate.

-- Fight Camp — Phase 1 migration
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Two independent changes:
--   1. Freeze the per-day calorie assumptions so changing a setting stops
--      rewriting history.
--   2. Make camps first-class records instead of a single window in settings.
--
-- SAFE TO RUN WHILE THE CURRENT APP IS LIVE. Nothing here drops or renames
-- anything the deployed build reads. The retirement of settings.camp_start /
-- camp_end is deliberately NOT in this script -- see the note at the bottom.


-- ---------------------------------------------------------------------------
-- 1. Per-day snapshots of RMR and base calories
-- ---------------------------------------------------------------------------
-- burnFor()/intakeFor() currently read settings.rmr and settings.base_cal on
-- every render, so the whole history is displayed through today's assumptions.
-- The raw per-day facts (weight, extra_cal, training_cal) were never at risk;
-- it is the lens that moved. These columns record the lens each day was
-- actually logged under.
--
-- Nullable on purpose: the app falls back to the global setting when a row
-- predates this change or a write missed it.

alter table public.entries add column if not exists rmr_used      integer;
alter table public.entries add column if not exists base_cal_used integer;

comment on column public.entries.rmr_used is
  'RMR in force when this day was logged. Null falls back to settings.rmr.';
comment on column public.entries.base_cal_used is
  'Base calorie plan in force when this day was logged. Null falls back to settings.base_cal.';

-- Backfill from the two BodySpec scans: each day is measured by the best
-- estimate that existed at the time. The 2026-06-18 scan estimated 2138; the
-- 2026-08-31 scan estimated 2067. base_cal has been 1500 throughout.
update public.entries
   set rmr_used = 2138, base_cal_used = 1500
 where date < '2026-08-31' and rmr_used is null;

update public.entries
   set rmr_used = 2067, base_cal_used = 1500
 where date >= '2026-08-31' and rmr_used is null;


-- ---------------------------------------------------------------------------
-- 2. Camps as records
-- ---------------------------------------------------------------------------
-- settings held exactly one camp window, so starting a second camp would have
-- overwritten the first. campMode.active is derived in the app: a camp exists,
-- is not archived, and today falls inside its dates.

create table if not exists public.camps (
  id            bigint generated always as identity primary key,
  name          text        not null,
  start_date    date        not null,
  end_date      date        not null,
  target_weight numeric,                 -- null = no goal set
  archived      boolean     not null default false,
  results_json  jsonb,                   -- populated on archive; see ROADMAP
  created_at    timestamptz not null default now(),

  constraint camps_dates_ordered check (end_date >= start_date)
);

create index if not exists camps_start_idx on public.camps (start_date);

alter table public.camps enable row level security;

-- Same posture as every other table: any signed-in user of this project has
-- full access, anonymous visitors none. The sync's service_role key bypasses
-- RLS and is unaffected.
drop policy if exists "authenticated full access" on public.camps;
create policy "authenticated full access" on public.camps
  for all
  to authenticated
  using (true)
  with check (true);

-- Migrate the existing window. Guarded so re-running this script cannot
-- create a duplicate camp.
insert into public.camps (name, start_date, end_date, archived)
select 'Summer Fight Camp 2026', s.camp_start, s.camp_end, false
  from public.settings s
 where s.id = 1
   and not exists (select 1 from public.camps);


-- ---------------------------------------------------------------------------
-- NOT IN THIS SCRIPT, ON PURPOSE
-- ---------------------------------------------------------------------------
-- settings.camp_start and settings.camp_end are left in place. The deployed
-- app still reads them on every boot, so dropping them now would break the
-- live app immediately. They get retired in a second migration once the
-- five-tab build is merged and reading from camps instead.

-- Fight Camp — Phase 2 migration (Train)
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Additive only. Nothing here is read by the currently deployed app, so this is
-- safe to run at any time, including before the five-tab build is merged.


-- ---------------------------------------------------------------------------
-- Workout templates
-- ---------------------------------------------------------------------------
-- A template is a named session: an ordered list of rounds. Rounds live in JSONB
-- rather than their own table because they are only ever read and written as a
-- whole list, they are reordered by dragging (so their order is the data), and
-- nothing needs to query across them.
--
-- Shape of `rounds`:
--   [{ "name": "Bag · jab doubles", "seconds": 180, "kind": "work" }, ...]
-- `kind` is 'work' | 'rest' | 'note'. Durations are seconds, not minutes: the
-- runner computes everything from one epoch timestamp and comparing seconds to
-- seconds avoids a units bug in the one place it would be hardest to see.

create table if not exists public.workout_templates (
  id            bigint generated always as identity primary key,
  name          text        not null,
  subtitle      text,                          -- e.g. "3:00 work / 1:00 rest"
  rounds        jsonb       not null default '[]'::jsonb,
  work_seconds  integer     not null default 180,   -- defaults the builder offers
  rest_seconds  integer     not null default 60,
  archived      boolean     not null default false,
  created_at    timestamptz not null default now(),

  constraint workout_templates_rounds_is_array check (jsonb_typeof(rounds) = 'array')
);

create index if not exists workout_templates_active_idx
  on public.workout_templates (archived, name);

alter table public.workout_templates enable row level security;

drop policy if exists "authenticated full access" on public.workout_templates;
create policy "authenticated full access" on public.workout_templates
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- Completed template sessions
-- ---------------------------------------------------------------------------
-- What the runner writes when a session finishes. Deliberately SEPARATE from
-- `workouts`, which is the Myzone sync's table and whose (date, start_time) key
-- is how that sync stays idempotent against Myzone's resends. Writing runner
-- output into `workouts` would collide with that and risk the sync overwriting
-- a real session, or the app inventing one Myzone never reported.
--
-- `entries.training_cal` stays authoritative for the daily burn total and keeps
-- coming from Myzone. This table records what was *planned and performed*.

create table if not exists public.template_sessions (
  id              bigint generated always as identity primary key,
  template_id     bigint      references public.workout_templates(id) on delete set null,
  template_name   text        not null,        -- denormalised: the record must
                                               -- survive its template being deleted
  date            date        not null,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  rounds_planned  integer,
  rounds_done     integer,
  completed       boolean     not null default false,  -- false = ended early
  created_at      timestamptz not null default now()
);

create index if not exists template_sessions_date_idx on public.template_sessions (date desc);

alter table public.template_sessions enable row level security;

drop policy if exists "authenticated full access" on public.template_sessions;
create policy "authenticated full access" on public.template_sessions
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- Content: training tips, weekly focus, quotes
-- ---------------------------------------------------------------------------
-- One typed table rather than three. The tips library, the weekly focus card on
-- Today and the rotating daily quote are the same thing -- a piece of written
-- content with a kind and a category -- and splitting them would mean three
-- near-identical tables and three loaders.

create table if not exists public.content (
  id          bigint generated always as identity primary key,
  kind        text        not null,   -- 'tip' | 'focus' | 'quote'
  category    text,                   -- tips only: e.g. 'Footwork', 'Defence'
  title       text,
  body        text        not null,
  attribution text,                   -- quotes only
  week        integer,                -- focus only: ISO week it belongs to
  year        integer,                -- focus only
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),

  constraint content_kind_known check (kind in ('tip','focus','quote'))
);

create index if not exists content_kind_idx on public.content (kind, active);
create index if not exists content_focus_idx on public.content (year, week) where kind = 'focus';

alter table public.content enable row level security;

drop policy if exists "authenticated full access" on public.content;
create policy "authenticated full access" on public.content
  for all to authenticated using (true) with check (true);

-- Fight Camp Tracker — per-session workout breakdown
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Each row is one real-world Myzone session. `entries.training_cal` stays the
-- authoritative daily total; this table is the detail behind it.

create table if not exists public.workouts (
  id          bigint generated always as identity primary key,
  date        date        not null,
  start_time  time        not null,
  minutes     integer,
  avg_effort  integer,          -- percent, as reported by Myzone
  calories    integer,
  name        text,             -- user-typed activity label; Myzone does not supply one
  created_at  timestamptz not null default now(),

  -- (date, start_time) is how the sync identifies a real session: Myzone resends
  -- corrected summaries where the END time and calories shift but the start does
  -- not. This constraint is what makes the sync's upsert idempotent.
  constraint workouts_session_key unique (date, start_time)
);

create index if not exists workouts_date_idx on public.workouts (date);

alter table public.workouts enable row level security;

-- Same posture as the other tables: any signed-in user of this project has full
-- access; anonymous visitors have none. The service_role key used by the sync
-- bypasses RLS entirely and is unaffected by this policy.
drop policy if exists "authenticated full access" on public.workouts;
create policy "authenticated full access" on public.workouts
  for all
  to authenticated
  using (true)
  with check (true);

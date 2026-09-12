-- Fight Camp — Phase 5 migration (Archetype reservations)
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Additive only. The currently deployed app reads none of this, so it is safe
-- to run at any time.


-- ---------------------------------------------------------------------------
-- reservations — read from the gym's confirmation emails
-- ---------------------------------------------------------------------------
-- One row per class, holding its CURRENT state. The scheduled sync resolves
-- each class's email history (booked, cancelled, rebooked...) down to the
-- newest email and writes the result; nothing here is an event log.
--
-- Identity is (date, start_time, class_name). The cancellation email names the
-- class and time, and — in its body, not its subject — the date.
--
-- The app only reads this table. Writes come from the sync, which uses the
-- service_role key and bypasses RLS, so authenticated users get SELECT only.
-- Booking was cut (Mariana Tek's API is partner-gated): nothing in the app can
-- create a reservation.

create table if not exists public.reservations (
  id             bigint generated always as identity primary key,
  date           date        not null,
  start_time     time        not null,
  class_name     text        not null,   -- as the gym writes it, "(Coach Approval Required)" and all
  instructors    text,                   -- "Jeremy C, Tyson Mendeas"
  status         text        not null default 'booked',
  no_show        boolean     not null default false,   -- a No Show Fee receipt, not reversed by a refund
  message_id     text,                   -- Gmail id of the email that set `status`
  email_sent_at  timestamptz,            -- when that email was sent
  updated_at     timestamptz not null default now(),

  constraint reservations_status_known check (status in ('booked','cancelled')),
  constraint reservations_identity unique (date, start_time, class_name)
);

create index if not exists reservations_date_idx on public.reservations (date, start_time);

alter table public.reservations enable row level security;
drop policy if exists "authenticated read" on public.reservations;
create policy "authenticated read" on public.reservations
  for select to authenticated using (true);


-- ---------------------------------------------------------------------------
-- workouts.name_auto — what the reservation step last wrote into `name`
-- ---------------------------------------------------------------------------
-- The reservation step may fill `name` only while it is NULL, or while it still
-- equals `name_auto` (i.e. nobody has retyped it since). A label typed in any
-- build of the app, including the live one that has never heard of this column,
-- no longer matches and is never overwritten.
--
-- The Myzone sync must keep omitting BOTH `name` and `name_auto` from its upsert.

alter table public.workouts add column if not exists name_auto text;


-- ---------------------------------------------------------------------------
-- Realtime, so a freshly synced booking shows up without a reload
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and tablename = 'reservations') then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;

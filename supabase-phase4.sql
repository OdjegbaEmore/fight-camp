-- Fight Camp — Phase 4 migration (news feed, content sources)
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Additive only. Tips, weekly focus and quotes already have a home in `content`
-- (Phase 2); this adds the news table and a source link for content rows.
--
-- Both are written by local scheduled tasks through tools/content_publish.py,
-- using the service_role key (which bypasses RLS). The app only reads.


-- ---------------------------------------------------------------------------
-- news — one row per story, keyed by its URL
-- ---------------------------------------------------------------------------
-- `summary` is the routine's own words, never article text. `url` is the page
-- the routine actually read; no URL, no row.
--
-- A real unique constraint on url, not a partial index: PostgREST's on_conflict
-- cannot target a partial unique index, and re-runs must be idempotent.
--
-- Old stories are hidden (active = false) after 30 days rather than deleted.

create table if not exists public.news (
  id            bigint generated always as identity primary key,
  url           text        not null,
  title         text        not null,
  source        text        not null,
  category      text        not null,   -- 'pro' | 'amateur' | 'science' | 'austin'
  summary       text        not null,
  why           text,                   -- optional one line: why it matters to a boxer
  published_at  date,
  fetched_at    timestamptz not null default now(),
  active        boolean     not null default true,

  constraint news_url_key        unique (url),
  constraint news_url_http       check (url ~ '^https?://'),
  constraint news_category_known check (category in ('pro','amateur','science','austin'))
);

create index if not exists news_active_idx on public.news (active, published_at desc);

alter table public.news enable row level security;

-- Read-only for the signed-in app. Writes come from the service_role key only.
drop policy if exists "authenticated read" on public.news;
create policy "authenticated read" on public.news
  for select to authenticated using (true);


-- ---------------------------------------------------------------------------
-- content.source_url — where a tip's figure or a quote's attribution came from
-- ---------------------------------------------------------------------------
-- Required by the publisher for every quote (attributions are verified) and for
-- any tip that states a measured figure (grams, percent, kcal, ...).

alter table public.content add column if not exists source_url text;

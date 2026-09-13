-- Fight Camp — Phase 6 migration (weekly planner and grocery list)
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Additive only. Custom foods need no migration: they are `foods` rows with
-- source = 'custom', which the Phase 3 schema already allows.


-- ---------------------------------------------------------------------------
-- planner_entries — a week of meals, one row per planned dish
-- ---------------------------------------------------------------------------
-- Macros are denormalised at planning time, like food_log: editing a recipe
-- later must not silently rewrite a week that was already planned.
--
-- The diary's "Fill day" reads these first for a date, and falls back to the
-- active day plan (meal_plans) when a day has nothing planned.

create table if not exists public.planner_entries (
  id          bigint generated always as identity primary key,
  date        date        not null,
  meal        text        not null default 'dinner',
  recipe_id   bigint      references public.recipes(id) on delete set null,
  name        text        not null,
  servings    numeric     not null default 1,
  kcal        numeric     not null default 0,
  protein     numeric     not null default 0,
  fat         numeric     not null default 0,
  carb        numeric     not null default 0,
  created_at  timestamptz not null default now(),

  constraint planner_meal_known check (meal in ('breakfast','lunch','dinner','extra'))
);

create index if not exists planner_date_idx on public.planner_entries (date, meal);

alter table public.planner_entries enable row level security;
drop policy if exists "authenticated full access" on public.planner_entries;
create policy "authenticated full access" on public.planner_entries
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- grocery_items — the week's shopping list
-- ---------------------------------------------------------------------------
-- `source` separates what the app built from the planner (rebuilt on demand)
-- from what was typed by hand (never touched by a rebuild). `amount` is free
-- text: recipe amounts like "9 oz (255g)" cannot be summed safely.

create table if not exists public.grocery_items (
  id          bigint generated always as identity primary key,
  week_start  date        not null,              -- the Monday of the week
  name        text        not null,
  amount      text,
  source      text        not null default 'manual',
  checked     boolean     not null default false,
  created_at  timestamptz not null default now(),

  constraint grocery_source_known check (source in ('manual','planner'))
);

create index if not exists grocery_week_idx on public.grocery_items (week_start, checked, name);

alter table public.grocery_items enable row level security;
drop policy if exists "authenticated full access" on public.grocery_items;
create policy "authenticated full access" on public.grocery_items
  for all to authenticated using (true) with check (true);

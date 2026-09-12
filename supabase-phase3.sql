-- Fight Camp — Phase 3 migration (Fuel)
-- Run once in the Supabase SQL editor (project zbwqewemphykxqqksaza).
--
-- Additive only. The currently deployed app reads none of this, so it is safe
-- to run at any time.


-- ---------------------------------------------------------------------------
-- foods — the pantry
-- ---------------------------------------------------------------------------
-- One row per thing you might eat, whether it came from a database lookup or
-- you typed it. Macros are stored per 100g because that is the unit both
-- Open Food Facts and USDA return; portions are computed at log time.
--
-- This doubles as the favourites list: `favourite` is what the Add Food screen
-- shows first, and `use_count` is what orders it. Searching is the slow path;
-- the fast path is the ten things actually eaten every week.

create table if not exists public.foods (
  id            bigint generated always as identity primary key,
  source        text        not null default 'custom',   -- 'usda' | 'off' | 'custom'
  source_id     text,                                    -- fdcId or barcode, for re-lookup
  name          text        not null,
  brand         text,
  serving_desc  text,                                    -- e.g. "1 medium (118g)"
  serving_grams numeric,                                 -- null = log in grams only
  kcal_100g     numeric     not null default 0,
  protein_100g  numeric     not null default 0,
  fat_100g      numeric     not null default 0,
  carb_100g     numeric     not null default 0,
  favourite     boolean     not null default false,
  use_count     integer     not null default 0,
  created_at    timestamptz not null default now(),

  constraint foods_source_known check (source in ('usda','off','custom'))
);

-- A lookup is cached once, not once per log entry.
create unique index if not exists foods_source_unique
  on public.foods (source, source_id) where source_id is not null;
create index if not exists foods_fav_idx on public.foods (favourite, use_count desc);

alter table public.foods enable row level security;
drop policy if exists "authenticated full access" on public.foods;
create policy "authenticated full access" on public.foods
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- food_log — what was actually eaten
-- ---------------------------------------------------------------------------
-- Macros are DENORMALISED onto each row rather than joined from `foods`.
-- Deliberate: editing a food's macros, or deleting it, must not silently
-- rewrite what a past day's intake was. Same principle as entries.rmr_used --
-- history records what was true at the time.
--
-- `source` is what drives the UI. Plan-sourced rows get the × affordance and
-- are what "Clear plan" removes; manually logged rows are left alone by it.

create table if not exists public.food_log (
  id         bigint generated always as identity primary key,
  date       date        not null,
  meal       text        not null default 'extra',   -- breakfast|lunch|dinner|extra
  food_id    bigint      references public.foods(id) on delete set null,
  recipe_id  bigint,                                 -- set below, after recipes exists
  name       text        not null,
  qty        numeric     not null default 1,
  unit       text        not null default 'serving', -- 'serving' | 'g'
  kcal       numeric     not null default 0,
  protein    numeric     not null default 0,
  fat        numeric     not null default 0,
  carb       numeric     not null default 0,
  source     text        not null default 'manual',  -- 'plan' | 'manual' | 'recipe'
  logged_at  timestamptz not null default now(),

  constraint food_log_meal_known check (meal in ('breakfast','lunch','dinner','extra')),
  constraint food_log_source_known check (source in ('plan','manual','recipe'))
);

create index if not exists food_log_date_idx on public.food_log (date, meal);

alter table public.food_log enable row level security;
drop policy if exists "authenticated full access" on public.food_log;
create policy "authenticated full access" on public.food_log
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- recipes — the cookbook
-- ---------------------------------------------------------------------------
-- Ingredients and steps are JSONB: they are read and written as whole ordered
-- lists, their order is the data, and nothing queries across them.
--   ingredients: [{ "item": "Pork tenderloin, trimmed", "amount": "9 oz (255g)" }]
--   steps:       ["Heat 1 tsp olive oil ...", ...]

create table if not exists public.recipes (
  id           bigint generated always as identity primary key,
  name         text        not null,
  meal         text,                        -- breakfast|lunch|dinner|extra
  description  text,
  servings     numeric     not null default 1,
  kcal         numeric     not null default 0,
  protein      numeric     not null default 0,
  fat          numeric     not null default 0,
  carb         numeric     not null default 0,
  ingredients  jsonb       not null default '[]'::jsonb,
  steps        jsonb       not null default '[]'::jsonb,
  source       text,                        -- which plan document it came from
  archived     boolean     not null default false,
  created_at   timestamptz not null default now(),

  constraint recipes_ingredients_is_array check (jsonb_typeof(ingredients) = 'array'),
  constraint recipes_steps_is_array check (jsonb_typeof(steps) = 'array')
);

create index if not exists recipes_active_idx on public.recipes (archived, meal, name);

alter table public.recipes enable row level security;
drop policy if exists "authenticated full access" on public.recipes;
create policy "authenticated full access" on public.recipes
  for all to authenticated using (true) with check (true);

-- Now that recipes exists, point food_log at it.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_name = 'food_log_recipe_id_fkey'
  ) then
    alter table public.food_log
      add constraint food_log_recipe_id_fkey
      foreign key (recipe_id) references public.recipes(id) on delete set null;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- meal_plans — a day's worth of recipes, and its targets
-- ---------------------------------------------------------------------------
-- `items` is the plan's shape: which recipe fills which meal.
--   [{ "meal": "lunch", "recipe_id": 3, "name": "Turkey Taco Bowl" }]
-- Exactly one plan may be active; that is what the diary autofills from.

create table if not exists public.meal_plans (
  id             bigint generated always as identity primary key,
  name           text        not null,
  description    text,
  kcal_target    numeric,
  protein_target numeric,
  items          jsonb       not null default '[]'::jsonb,
  active         boolean     not null default false,
  created_at     timestamptz not null default now(),

  constraint meal_plans_items_is_array check (jsonb_typeof(items) = 'array')
);

-- Only one plan can be active at a time; the diary's autofill would be
-- ambiguous otherwise.
create unique index if not exists meal_plans_one_active
  on public.meal_plans (active) where active;

alter table public.meal_plans enable row level security;
drop policy if exists "authenticated full access" on public.meal_plans;
create policy "authenticated full access" on public.meal_plans
  for all to authenticated using (true) with check (true);

// Shared mutable app state and the Supabase client.
// Imported by every module; there is exactly one of each.

import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_SETTINGS } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const state = {
  settings: Object.assign({}, DEFAULT_SETTINGS),
  entries: {},
  dexaScans: [],
  workouts: [],
  // Read-only, written by the Archetype sync. null = could not be loaded (the
  // Phase 5 migration not run), which the screens say rather than "nothing booked".
  reservations: [],
  camps: [],
  templates: [],
  templateSessions: [],
  foods: [],
  recipes: [],
  plans: [],
  diary: [],
  diaryDate: null,
  // The week shown in Planner and Groceries (its Monday), loaded on demand like
  // the diary. planner/grocery are null when the Phase 6 tables are missing.
  week: null,
  planner: [],
  grocery: [],
  // The date the entry sheet is currently editing. Was the Log tab's date field.
  editDate: null
};

// `render` is assigned by app.js. Modules that need a redraw call this rather
// than importing app.js, which would be circular.
export const hooks = { render: () => {} };

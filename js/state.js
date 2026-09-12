// Shared mutable app state and the Supabase client.
// Imported by every module; there is exactly one of each.

import { SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_SETTINGS } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const state = {
  settings: Object.assign({}, DEFAULT_SETTINGS),
  entries: {},
  dexaScans: [],
  workouts: [],
  camps: [],
  templates: [],
  templateSessions: [],
  foods: [],
  recipes: [],
  plans: [],
  diary: [],
  diaryDate: null,
  // The date the entry sheet is currently editing. Was the Log tab's date field.
  editDate: null
};

// `render` is assigned by app.js. Modules that need a redraw call this rather
// than importing app.js, which would be circular.
export const hooks = { render: () => {} };

// Fight Camp — configuration and seed data.
// The anon key belongs in the client: RLS does the access control. The
// service_role key must NEVER appear here or anywhere in this repo.

export const SUPABASE_URL = 'https://zbwqewemphykxqqksaza.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpid3Fld2VtcGh5a3hxcWtzYXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDY0NDAsImV4cCI6MjEwMTEyMjQ0MH0.PBFH1O7PrSNg6JkWk49w2et_YamGxz1KA8DuFFsQEGU';

export const LEGACY_STORAGE_KEY = 'fightcamp_tracker_v1';
export const IMPORT_DISMISSED_KEY = 'fightcamp_import_dismissed';

// rmr/baseCal are the *current* assumptions. Each entry snapshots the pair it was
// logged under (entries.rmr_used / base_cal_used), so changing these never rewrites
// the past — see calc.js.
export const DEFAULT_SETTINGS = { rmr: 2067, baseCal: 1500 };

// Off-season the weight chart rolls this many days instead of being camp-scoped.
export const OFFSEASON_WINDOW_DAYS = 90;

export const WEIGH_STEP = 0.5;

// Direction 3b palette, mirrored for Chart.js which can't read CSS variables.
export const C = {
  accent: '#ef7059',
  paper:  '#e7e1df',
  muted:  '#a5a09d',
  grid:   'rgba(248,244,244,0.14)'
};

export const BACKFILL_LOG = [{"date":"2026-06-17","weight":null,"extraCal":0,"trainingCal":576,"notes":""},{"date":"2026-06-18","weight":null,"extraCal":0,"trainingCal":586,"notes":""},{"date":"2026-06-19","weight":null,"extraCal":0,"trainingCal":537,"notes":""},{"date":"2026-06-20","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-06-21","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-06-22","weight":null,"extraCal":0,"trainingCal":1225,"notes":""},{"date":"2026-06-23","weight":null,"extraCal":0,"trainingCal":2365,"notes":""},{"date":"2026-06-24","weight":null,"extraCal":0,"trainingCal":1343,"notes":""},{"date":"2026-06-25","weight":null,"extraCal":0,"trainingCal":727,"notes":""},{"date":"2026-06-26","weight":null,"extraCal":0,"trainingCal":736,"notes":""},{"date":"2026-06-27","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-06-28","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-06-29","weight":null,"extraCal":0,"trainingCal":960,"notes":""},{"date":"2026-06-30","weight":null,"extraCal":0,"trainingCal":1087,"notes":""},{"date":"2026-07-01","weight":null,"extraCal":0,"trainingCal":1249,"notes":""},{"date":"2026-07-02","weight":null,"extraCal":0,"trainingCal":1607,"notes":""},{"date":"2026-07-03","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-07-04","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-07-05","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-07-06","weight":null,"extraCal":0,"trainingCal":868,"notes":""},{"date":"2026-07-07","weight":null,"extraCal":0,"trainingCal":1100,"notes":""},{"date":"2026-07-08","weight":null,"extraCal":0,"trainingCal":1133,"notes":""},{"date":"2026-07-09","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-07-10","weight":null,"extraCal":0,"trainingCal":869,"notes":""},{"date":"2026-07-11","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-07-12","weight":null,"extraCal":0,"trainingCal":0,"notes":""},{"date":"2026-07-13","weight":283.0,"extraCal":0,"trainingCal":1390,"notes":""},{"date":"2026-07-14","weight":281.0,"extraCal":160,"trainingCal":1644,"notes":""},{"date":"2026-07-15","weight":276.0,"extraCal":160,"trainingCal":2652,"notes":""},{"date":"2026-07-16","weight":null,"extraCal":0,"trainingCal":775,"notes":""},{"date":"2026-07-17","weight":273.0,"extraCal":500,"trainingCal":1539,"notes":""},{"date":"2026-07-18","weight":264.0,"extraCal":250,"trainingCal":1871,"notes":""},{"date":"2026-07-19","weight":null,"extraCal":0,"trainingCal":711,"notes":""},{"date":"2026-07-20","weight":264.0,"extraCal":1000,"trainingCal":1042,"notes":""},{"date":"2026-07-21","weight":275.0,"extraCal":160,"trainingCal":1027,"notes":""},{"date":"2026-07-22","weight":272.0,"extraCal":0,"trainingCal":1734,"notes":""},{"date":"2026-07-23","weight":272.0,"extraCal":0,"trainingCal":1988,"notes":""},{"date":"2026-07-24","weight":274.0,"extraCal":0,"trainingCal":1315,"notes":""},{"date":"2026-07-25","weight":272.0,"extraCal":1000,"trainingCal":1747,"notes":""},{"date":"2026-07-26","weight":272.0,"extraCal":0,"trainingCal":732,"notes":""},{"date":"2026-07-27","weight":273.0,"extraCal":0,"trainingCal":668,"notes":""},{"date":"2026-07-28","weight":272.0,"extraCal":500,"trainingCal":1019,"notes":""},{"date":"2026-07-29","weight":274.0,"extraCal":500,"trainingCal":1851,"notes":""},{"date":"2026-07-30","weight":268.0,"extraCal":1400,"trainingCal":1449,"notes":""},{"date":"2026-07-31","weight":269.0,"extraCal":500,"trainingCal":1293,"notes":""}];

// `weight` is each scan's own Total Mass, not that day's scale weigh-in. The
// 2026-06-18 row reads 280 (the intake weight the app was seeded with) where the
// PDF's Total Mass is 279.3 — left as-is, it has been on screen all camp.
export const BACKFILL_DEXA = [
  { date: "2026-06-18", label: "Pre-Camp Baseline", weight: 280,   bf: 30.9, lean: 183.8 },
  { date: "2026-08-31", label: "Post-Camp Scan",    weight: 255.4, bf: 27.5, lean: 175.9 }
];

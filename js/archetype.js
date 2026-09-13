// Archetype Boxing — class reservations, as the app shows them.
//
// Reading the gym's emails, resolving rebookings and naming Myzone sessions all
// happen in tools/archetype_sync.py, run by the scheduled sync. The app only
// reads the `reservations` rows it writes, so this module is display logic.
// Read-only throughout: booking stays in the gym's app.

export const CLASS_MINUTES = 60;

function minutesOf(t){
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

// Local { date:'YYYY-MM-DD', time:'HH:MM:00' } — the shapes Postgres hands back.
export function localNow(d = new Date()){
  const p = n => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:00`
  };
}

// The gym appends booking rules to some names — "Boxing Ring Class (Coach
// Approval Required)". Stored in full, shown without.
export function displayClass(name){
  return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Booked classes not yet over, soonest first.
export function upcomingReservations(reservations, now = localNow()){
  const nowMin = minutesOf(now.time);
  return (reservations || [])
    .filter(r => r.status === 'booked' &&
      (r.date > now.date || (r.date === now.date && minutesOf(r.startTime) + CLASS_MINUTES > nowMin)))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

// Classes already over, most recent first — booked, cancelled and no-shows alike.
export function pastReservations(reservations, now = localNow()){
  const nowMin = minutesOf(now.time);
  return (reservations || [])
    .filter(r => r.date < now.date || (r.date === now.date && minutesOf(r.startTime) + CLASS_MINUTES <= nowMin))
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
}

// Deep link OUT to the gym's own schedule for a day. There is no Book button
// anywhere — Mariana Tek's booking API is partner-gated, and booking was cut.
export function scheduleUrl(dateISO){
  const inner = `/schedule/daily/48541?activeDate=${dateISO}&locations=48717`;
  return 'https://www.archetypeboxing.com/schedule?_mt=' + encodeURIComponent(inner);
}

// The gym's own app — a Mariana Tek white-label build, bundle com.marianatek.archetype.
export const APP_STORE_URL = 'https://apps.apple.com/us/app/archetype-boxing-club/id1585888501';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.marianatek.archetype';

// The app can't be opened with a link of its own (checked 2026-09-13):
//   - No universal links: archetypeboxing.com serves no apple-app-site-association
//     (HTTP 500), nor do the Mariana Tek tenant or main domains (404), and the gym's
//     own FAQ links only to the plain store pages — no Branch/AppsFlyer smart link.
//   - No published URL scheme; com.marianatek.archetype://, marianatek-archetype://,
//     archetype:// and archetypeboxing:// all failed in Safari on the user's iPhone.
//
// What does work on iOS is Apple's documented Shortcuts URL: a Shortcut named
// "Open Archetype" holding one action (Open App → Archetype Boxing Club), run with
// shortcuts://run-shortcut. Verified on the user's iPhone 2026-09-13. It needs that
// Shortcut to exist on the device, so it is opt-in per device (More → Gym app) and
// everything else falls back to the store page.
export const SHORTCUT_NAME = 'Open Archetype';
export const SHORTCUT_URL = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME);

const SHORTCUT_KEY = 'fc_gym_shortcut';

// Per device, in localStorage. Note an iPhone home-screen app keeps its own storage,
// separate from Safari's, so the switch has to be flipped inside the installed app.
export function gymShortcutOn(){
  try { return localStorage.getItem(SHORTCUT_KEY) === '1'; } catch(e) { return false; }
}
export function setGymShortcut(on){
  try { on ? localStorage.setItem(SHORTCUT_KEY, '1') : localStorage.removeItem(SHORTCUT_KEY); } catch(e) {}
}

// Where "book at the gym" goes on this device: the Shortcut on an opted-in iPhone,
// the store page on other phones (its Open button launches the app), the web
// schedule on desktop. `external` is false for the shortcuts:// URL, which must not
// open in a new tab. If the gym ever ships universal links, change only this.
export function gymLink(dateISO, ua = globalThis.navigator ? navigator.userAgent : '',
                        touchPoints = globalThis.navigator ? navigator.maxTouchPoints : 0,
                        shortcut = gymShortcutOn()){
  // iPadOS reports a Mac user agent; touch support gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (ios && shortcut) return { url: SHORTCUT_URL, label: 'Open app', kind: 'shortcut', external: false };
  if (ios) return { url: APP_STORE_URL, label: 'Open app', kind: 'ios', external: true };
  if (/Android/.test(ua)) return { url: PLAY_STORE_URL, label: 'Open app', kind: 'android', external: true };
  return { url: scheduleUrl(dateISO), label: 'Schedule', kind: 'web', external: true };
}

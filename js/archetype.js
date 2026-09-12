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

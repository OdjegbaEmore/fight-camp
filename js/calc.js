// Derived figures. Nothing here writes.

import { state } from './state.js';
import { todayISO, isoMinusDays } from './util.js';
import { OFFSEASON_WINDOW_DAYS } from './config.js';

// ---------------------------------------------------------------------------
// Calorie maths
// ---------------------------------------------------------------------------
// Each entry snapshots the RMR and base-calorie plan it was logged under. Prefer
// those over the live settings so changing a setting today cannot rewrite what
// yesterday's deficit was. Rows written before the snapshot columns existed fall
// back to the current global — the honest best guess for them.

export function rmrFor(e){
  const v = Number(e && e.rmrUsed);
  return Number.isFinite(v) && v > 0 ? v : state.settings.rmr;
}
export function baseCalFor(e){
  const v = Number(e && e.baseCalUsed);
  return Number.isFinite(v) && v > 0 ? v : state.settings.baseCal;
}
export function intakeFor(e){ return baseCalFor(e) + (Number(e.extraCal)||0); }
export function burnFor(e){ return rmrFor(e) + (Number(e.trainingCal)||0); }
export function netFor(e){ return burnFor(e) - intakeFor(e); }

// ---------------------------------------------------------------------------
// Entry lookups
// ---------------------------------------------------------------------------
export function sortedDates(){ return Object.keys(state.entries).sort(); }

function hasWeight(d){
  const w = state.entries[d] && state.entries[d].weight;
  return w !== null && w !== undefined && w !== "";
}

export function latestWeight(){
  const dates = sortedDates();
  for (let i = dates.length-1; i>=0; i--){
    if (hasWeight(dates[i])) return { date: dates[i], weight: Number(state.entries[dates[i]].weight) };
  }
  return null;
}

export function firstWeight(){
  for (const d of sortedDates()){
    if (hasWeight(d)) return { date: d, weight: Number(state.entries[d].weight) };
  }
  return null;
}

export function weighedDatesBetween(fromISO, toISO){
  return sortedDates().filter(d => {
    if (fromISO && d < fromISO) return false;
    if (toISO && d > toISO) return false;
    return hasWeight(d);
  });
}

// First weigh-in at or after a date — the baseline a camp is measured from.
export function firstWeightFrom(fromISO){
  for (const d of sortedDates()){
    if (d >= fromISO && hasWeight(d)) return { date: d, weight: Number(state.entries[d].weight) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Camps
// ---------------------------------------------------------------------------
// campMode.active is derived, never stored: a camp exists, is not archived, and
// today falls inside its dates.

export function campsSorted(){
  return (state.camps || []).slice().sort((a,b) => String(a.startDate).localeCompare(String(b.startDate)));
}

export function activeCamp(){
  const t = todayISO();
  return campsSorted().find(c => !c.archived && c.startDate <= t && t <= c.endDate) || null;
}

// The camp whose numbers the app should measure against when none is running:
// the most recent one by start date.
export function mostRecentCamp(){
  const all = campsSorted();
  return all.length ? all[all.length - 1] : null;
}

export function campMode(){
  const camp = activeCamp();
  if (!camp) return { active: false, camp: null };
  const start = new Date(camp.startDate + "T00:00:00");
  const end   = new Date(camp.endDate + "T00:00:00");
  const now   = new Date(todayISO() + "T00:00:00");
  const dayCount = Math.round((end - start)/86400000) + 1;
  const dayIndex = Math.min(dayCount, Math.round((now - start)/86400000) + 1);
  const daysOut  = Math.max(0, Math.round((end - now)/86400000));
  const pct = dayCount > 0 ? Math.min(100, Math.max(0, (dayIndex/dayCount)*100)) : 0;
  return { active: true, camp, dayIndex, dayCount, daysOut, pct };
}

// The baseline "total loss" counts from: the start of the most recent camp.
// Settled 2026-09-11, superseding the older all-time-first-weigh-in rule.
export function baselineWeight(){
  const camp = activeCamp() || mostRecentCamp();
  if (camp) {
    const fw = firstWeightFrom(camp.startDate);
    if (fw) return fw;
  }
  return firstWeight();
}

// Which date range the weight chart covers: the camp window while one runs,
// otherwise a rolling window so off-season weigh-ins still render.
export function chartRange(){
  const cm = campMode();
  if (cm.active) return { from: cm.camp.startDate, to: cm.camp.endDate, scope: 'camp', label: cm.camp.name };
  const t = todayISO();
  return {
    from: isoMinusDays(t, OFFSEASON_WINDOW_DAYS),
    to: t,
    scope: 'rolling',
    label: `Last ${OFFSEASON_WINDOW_DAYS} days`
  };
}

function daysBetween(a, b){
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

// Everything the camp look-back shows, for any camp — running, ended or upcoming.
// Measured inside the camp's own dates, and only up to today for one still running.
export function campStats(camp){
  const today = todayISO();
  const from = camp.startDate;
  const to = camp.endDate < today ? camp.endDate : today;
  const started = from <= today;

  const weighedDates = started ? weighedDatesBetween(from, to) : [];
  const at = d => ({ date: d, weight: Number(state.entries[d].weight) });
  const first = weighedDates.length ? at(weighedDates[0]) : null;
  const last = weighedDates.length ? at(weighedDates[weighedDates.length - 1]) : null;
  const rate = (first && last && last.date > first.date)
    ? ((first.weight - last.weight) / daysBetween(first.date, last.date)) * 7
    : null;

  const days = started ? sortedDates().filter(d => d >= from && d <= to) : [];
  const totalDeficit = days.reduce((a, d) => a + netFor(state.entries[d]), 0);
  const sessions = (state.workouts || []).filter(w => w.date >= from && w.date <= to);
  const pad = 14;   // a scan a week or two either side still describes the camp
  const scans = (state.dexaScans || [])
    .filter(s => s.date >= isoMinusDays(from, pad) && s.date <= isoMinusDays(to, -pad))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    started,
    dayCount: daysBetween(camp.startDate, camp.endDate) + 1,
    daysDone: started ? daysBetween(from, to) + 1 : 0,
    weighedDates, weighed: weighedDates.length, first, last,
    change: first && last ? last.weight - first.weight : null,
    rate,
    loggedDays: days.length,
    avgDeficit: days.length ? totalDeficit / days.length : null,
    totalDeficit,
    trainingKcal: days.reduce((a, d) => a + (Number(state.entries[d].trainingCal) || 0), 0),
    sessions: sessions.length,
    minutes: sessions.reduce((a, w) => a + (Number(w.minutes) || 0), 0),
    timerSessions: (state.templateSessions || []).filter(s => s.date >= from && s.date <= to).length,
    scans
  };
}

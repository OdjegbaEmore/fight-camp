// All Supabase reads and writes.

import { sb, state, hooks } from './state.js';
import { setSyncStatus, todayISO } from './util.js';
import {
  DEFAULT_SETTINGS, LEGACY_STORAGE_KEY, IMPORT_DISMISSED_KEY,
  BACKFILL_LOG, BACKFILL_DEXA
} from './config.js';

function mapEntry(r){
  return {
    weight: r.weight,
    extraCal: r.extra_cal || 0,
    trainingCal: r.training_cal || 0,
    notes: r.notes || '',
    trainingCalManual: !!r.training_cal_manual,
    // Snapshot of the assumptions in force when this day was logged. See calc.js.
    rmrUsed: r.rmr_used ?? null,
    baseCalUsed: r.base_cal_used ?? null
  };
}

export async function loadAll(){
  const [entriesRes, dexaRes, settingsRes] = await Promise.all([
    sb.from('entries').select('*'),
    sb.from('dexa_scans').select('*'),
    sb.from('settings').select('*').eq('id', 1)
  ]);
  if (entriesRes.error || dexaRes.error || settingsRes.error) {
    setSyncStatus('error', (entriesRes.error || dexaRes.error || settingsRes.error).message);
    return false;
  }

  state.entries = {};
  (entriesRes.data || []).forEach(r => { state.entries[r.date] = mapEntry(r); });

  state.dexaScans = (dexaRes.data || []).map(r => ({
    id: r.id, date: r.date, label: r.label, weight: r.weight, bf: r.bf, lean: r.lean
  }));

  if (settingsRes.data && settingsRes.data[0]) {
    const s = settingsRes.data[0];
    state.settings = { rmr: s.rmr, baseCal: s.base_cal };
  } else {
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
    await sb.from('settings').upsert({ id: 1, rmr: state.settings.rmr, base_cal: state.settings.baseCal });
  }

  // workouts and camps load failure-tolerantly: both are newer than the rest of
  // the schema, and a project that hasn't run the migrations yet must still boot
  // with everything else intact. An error here means "no detail available",
  // never a dead app.
  const wRes = await sb.from('workouts').select('*').order('start_time', { ascending: true });
  state.workouts = wRes.error ? [] : (wRes.data || []).map(r => ({
    id: r.id, date: r.date, startTime: r.start_time, minutes: r.minutes,
    avgEffort: r.avg_effort, calories: r.calories, name: r.name || ''
  }));

  const cRes = await sb.from('camps').select('*').order('start_date', { ascending: true });
  state.camps = cRes.error ? [] : (cRes.data || []).map(r => ({
    id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date,
    targetWeight: r.target_weight, archived: !!r.archived, results: r.results_json || null
  }));

  setSyncStatus('ok');
  return true;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
export async function upsertEntry(date, entry){
  // A day being written now records the assumptions in force now. Existing rows
  // keep whatever they were logged under.
  const row = Object.assign({}, entry);
  if (row.rmrUsed == null) row.rmrUsed = state.settings.rmr;
  if (row.baseCalUsed == null) row.baseCalUsed = state.settings.baseCal;

  state.entries[date] = row;
  hooks.render();
  setSyncStatus('saving');
  const { error } = await sb.from('entries').upsert({
    date,
    weight: row.weight,
    extra_cal: row.extraCal,
    training_cal: row.trainingCal,
    notes: row.notes,
    training_cal_manual: row.trainingCalManual,
    rmr_used: row.rmrUsed,
    base_cal_used: row.baseCalUsed
  });
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
}

export async function deleteEntry(date){
  delete state.entries[date];
  hooks.render();
  setSyncStatus('saving');
  const { error } = await sb.from('entries').delete().eq('date', date);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
}

export async function deleteDexa(id){
  state.dexaScans = state.dexaScans.filter(s => s.id !== id);
  hooks.render();
  setSyncStatus('saving');
  const { error } = await sb.from('dexa_scans').delete().eq('id', id);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
}

export async function saveWorkoutName(id, name){
  const w = state.workouts.find(x => x.id === id);
  if (!w || w.name === name) return;
  w.name = name;
  setSyncStatus('saving');
  const { error } = await sb.from('workouts').update({ name }).eq('id', id);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
}

export async function saveSettings(next){
  Object.assign(state.settings, next);
  setSyncStatus('saving');
  const { error } = await sb.from('settings').upsert({
    id: 1, rmr: state.settings.rmr, base_cal: state.settings.baseCal
  });
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  hooks.render();
}

export async function saveCamp(camp){
  setSyncStatus('saving');
  const row = {
    name: camp.name,
    start_date: camp.startDate,
    end_date: camp.endDate,
    target_weight: camp.targetWeight ?? null,
    archived: !!camp.archived
  };
  const q = camp.id
    ? sb.from('camps').update(row).eq('id', camp.id).select().single()
    : sb.from('camps').insert(row).select().single();
  const { error } = await q;
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadAll(); hooks.render(); }
}

export async function ensureToday(){
  const t = todayISO();
  if (!state.entries[t]) {
    await upsertEntry(t, {
      weight: null, extraCal: 0, trainingCal: 0, notes: "",
      trainingCalManual: false, rmrUsed: null, baseCalUsed: null
    });
  }
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------
let realtimeChannel = null;

export function setupRealtime(){
  if (realtimeChannel) return;
  const redraw = () => loadAll().then(hooks.render);
  realtimeChannel = sb.channel('fightcamp-sync');
  ['entries','dexa_scans','settings','workouts','camps'].forEach(table => {
    realtimeChannel.on('postgres_changes', { event:'*', schema:'public', table }, redraw);
  });
  realtimeChannel.subscribe();
}

// ---------------------------------------------------------------------------
// One-time migration off the old localStorage tracker
// ---------------------------------------------------------------------------
export async function maybeOfferImport(){
  const hasCloudData = Object.keys(state.entries).length > 0 || state.dexaScans.length > 0;
  if (hasCloudData || localStorage.getItem(IMPORT_DISMISSED_KEY)) return;
  let raw;
  try { raw = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null'); } catch(e) { raw = null; }
  if (!raw || !raw.entries) { localStorage.setItem(IMPORT_DISMISSED_KEY, '1'); return; }
  const dates = Object.keys(raw.entries);
  if (dates.length === 0) { localStorage.setItem(IMPORT_DISMISSED_KEY, '1'); return; }

  const ok = confirm(`Found ${dates.length} previously logged day(s) on this device that aren't in the cloud yet. Import them now?`);
  localStorage.setItem(IMPORT_DISMISSED_KEY, '1');
  if (!ok) return;

  setSyncStatus('importing');
  const entryRows = dates.map(d => {
    const e = raw.entries[d];
    return {
      date: d, weight: (e.weight === '' ? null : e.weight), extra_cal: e.extraCal || 0,
      training_cal: e.trainingCal || 0, notes: e.notes || '', training_cal_manual: !!e.trainingCalManual
    };
  });
  if (entryRows.length) {
    const { error } = await sb.from('entries').upsert(entryRows);
    if (error) setSyncStatus('error', error.message);
  }
  const dexaRows = (raw.dexaScans || []).map(s => ({ date: s.date, label: s.label, weight: s.weight, bf: s.bf, lean: s.lean }));
  if (dexaRows.length) {
    const { error } = await sb.from('dexa_scans').insert(dexaRows);
    if (error) setSyncStatus('error', error.message);
  }
  await loadAll();
}

export async function runBackfill(){
  const ok = confirm(`Import ${BACKFILL_LOG.length} days of historical data (weights, calories, training) from the old tracker's log into the cloud? This overwrites any existing cloud entries for those specific dates.`);
  if (!ok) return;
  setSyncStatus('importing');
  const rows = BACKFILL_LOG.map(r => ({
    date: r.date, weight: r.weight, extra_cal: r.extraCal, training_cal: r.trainingCal,
    notes: r.notes, training_cal_manual: false
  }));
  const { error } = await sb.from('entries').upsert(rows);
  if (error) { setSyncStatus('error', error.message); return; }
  // Per-date guard: dexa_scans has no unique key on date, so re-clicking Import
  // must not duplicate a scan that is already there.
  const missing = BACKFILL_DEXA.filter(b => !state.dexaScans.some(s => s.date === b.date));
  if (missing.length) {
    const { error: dexaErr } = await sb.from('dexa_scans').insert(missing);
    if (dexaErr) { setSyncStatus('error', dexaErr.message); return; }
  }
  await loadAll();
  hooks.render();
  setSyncStatus('ok');
}

export async function resetCloud(){
  if (!confirm('This permanently deletes ALL logged data in the cloud database (every device that syncs to it). This cannot be undone. Are you sure?')) return;
  setSyncStatus('saving');
  await sb.from('entries').delete().neq('date', '0000-00-00');
  await sb.from('dexa_scans').delete().neq('id', -1);
  await sb.from('camps').delete().neq('id', -1);
  state.settings = Object.assign({}, DEFAULT_SETTINGS);
  await sb.from('settings').upsert({ id: 1, rmr: state.settings.rmr, base_cal: state.settings.baseCal });
  await loadAll();
  await ensureToday();
  hooks.render();
}

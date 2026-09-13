// All Supabase reads and writes.

import { sb, state, hooks } from './state.js';
import { setSyncStatus, todayISO, isoMinusDays } from './util.js';
import {
  DEFAULT_SETTINGS, LEGACY_STORAGE_KEY, IMPORT_DISMISSED_KEY,
  BACKFILL_LOG, BACKFILL_DEXA
} from './config.js';

function mapFood(r){
  return {
    id:r.id, source:r.source, sourceId:r.source_id, name:r.name, brand:r.brand || '',
    servingDesc:r.serving_desc || '', servingGrams:r.serving_grams,
    kcal100:r.kcal_100g, protein100:r.protein_100g, fat100:r.fat_100g, carb100:r.carb_100g,
    favourite:!!r.favourite, useCount:r.use_count
  };
}

function mapTemplate(r){
  return {
    id: r.id, name: r.name, subtitle: r.subtitle || '',
    rounds: Array.isArray(r.rounds) ? r.rounds : [],
    workSeconds: r.work_seconds, restSeconds: r.rest_seconds,
    archived: !!r.archived
  };
}

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

  // Two months back is plenty for the Classes pane; the future is all of it.
  const resRes = await sb.from('reservations').select('*')
    .gte('date', isoMinusDays(todayISO(), 60))
    .order('date', { ascending: true }).order('start_time', { ascending: true });
  state.reservations = resRes.error ? null : (resRes.data || []).map(r => ({
    id: r.id, date: r.date, startTime: r.start_time, className: r.class_name,
    instructors: r.instructors || '', status: r.status, noShow: !!r.no_show
  }));

  const tRes = await sb.from('workout_templates').select('*')
    .eq('archived', false).order('name', { ascending: true });
  state.templates = tRes.error ? [] : (tRes.data || []).map(mapTemplate);

  const tsRes = await sb.from('template_sessions').select('*')
    .order('started_at', { ascending: false }).limit(50);
  state.templateSessions = tsRes.error ? [] : (tsRes.data || []).map(r => ({
    id: r.id, templateId: r.template_id, templateName: r.template_name, date: r.date,
    startedAt: r.started_at, endedAt: r.ended_at, roundsPlanned: r.rounds_planned,
    roundsDone: r.rounds_done, completed: !!r.completed
  }));

  const fRes = await sb.from('foods').select('*').order('use_count', { ascending: false });
  state.foods = fRes.error ? [] : (fRes.data || []).map(mapFood);

  const rRes = await sb.from('recipes').select('*').eq('archived', false).order('name');
  state.recipes = rRes.error ? [] : (rRes.data || []).map(r => ({
    id:r.id, name:r.name, meal:r.meal, description:r.description || '',
    servings:r.servings, kcal:r.kcal, protein:r.protein, fat:r.fat, carb:r.carb,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    source: r.source || ''
  }));

  const mpRes = await sb.from('meal_plans').select('*').order('name');
  state.plans = mpRes.error ? [] : (mpRes.data || []).map(r => ({
    id:r.id, name:r.name, description:r.description || '',
    kcalTarget:r.kcal_target, proteinTarget:r.protein_target,
    items: Array.isArray(r.items) ? r.items : [], active: !!r.active
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
  return !error;
}

// Removes the camp record only. Weigh-ins, food and training are dated rows in
// the main timeline and never belonged to a camp, so nothing else is touched.
export async function deleteCamp(id){
  setSyncStatus('saving');
  const { error } = await sb.from('camps').delete().eq('id', id);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadAll(); hooks.render(); }
  return !error;
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
  ['entries','dexa_scans','settings','workouts','camps','reservations'].forEach(table => {
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


// ---------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------
export async function saveTemplate(t){
  setSyncStatus('saving');
  const row = {
    name: t.name,
    subtitle: t.subtitle || null,
    rounds: t.rounds || [],
    work_seconds: t.workSeconds,
    rest_seconds: t.restSeconds,
    archived: !!t.archived
  };
  const q = t.id
    ? sb.from('workout_templates').update(row).eq('id', t.id).select().single()
    : sb.from('workout_templates').insert(row).select().single();
  const { data, error } = await q;
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (error) return null;
  await loadAll();
  hooks.render();
  return data;
}

export async function deleteTemplate(id){
  setSyncStatus('saving');
  // Archive rather than delete: template_sessions references this row and the
  // history should keep pointing somewhere real.
  const { error } = await sb.from('workout_templates').update({ archived: true }).eq('id', id);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadAll(); hooks.render(); }
}

export async function logTemplateSession(s){
  setSyncStatus('saving');
  const { error } = await sb.from('template_sessions').insert({
    template_id: s.templateId ?? null,
    // Denormalised on purpose: the record has to survive its template being
    // archived or renamed.
    template_name: s.templateName,
    date: s.date,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    rounds_planned: s.roundsPlanned,
    rounds_done: s.roundsDone,
    completed: !!s.completed
  });
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadAll(); hooks.render(); }
}


// ---------------------------------------------------------------------------
// Fuel
// ---------------------------------------------------------------------------

// Load one day's diary on demand. The whole log is never held in memory — it
// grows without bound and only one day is ever on screen.
export async function loadDiary(date){
  const { data, error } = await sb.from('food_log').select('*').eq('date', date).order('logged_at');
  if (error) { setSyncStatus('error', error.message); return []; }
  state.diaryDate = date;
  state.diary = (data || []).map(r => ({
    id:r.id, date:r.date, meal:r.meal, foodId:r.food_id, recipeId:r.recipe_id,
    name:r.name, qty:r.qty, unit:r.unit,
    kcal:r.kcal, protein:r.protein, fat:r.fat, carb:r.carb, source:r.source
  }));
  return state.diary;
}

// Macros are written onto the row, not joined from `foods`. Editing or deleting
// a food must never silently rewrite what a past day's intake was — the same
// principle as entries.rmr_used.
export async function addDiaryItem(item){
  setSyncStatus('saving');
  const { data, error } = await sb.from('food_log').insert({
    date:item.date, meal:item.meal, food_id:item.foodId ?? null, recipe_id:item.recipeId ?? null,
    name:item.name, qty:item.qty, unit:item.unit,
    kcal:item.kcal, protein:item.protein, fat:item.fat, carb:item.carb,
    source:item.source || 'manual'
  }).select().single();
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (error) return null;
  if (item.foodId) await bumpFoodUse(item.foodId);
  await loadDiary(item.date);
  hooks.render();
  return data;
}

export async function removeDiaryItem(id, date){
  setSyncStatus('saving');
  const { error } = await sb.from('food_log').delete().eq('id', id);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadDiary(date); hooks.render(); }
}

// Clear plan drops every plan-sourced row for the day and leaves anything
// logged by hand alone. That distinction is the whole reason `source` exists.
export async function clearPlanItems(date){
  setSyncStatus('saving');
  const removed = state.diary.filter(d => d.source === 'plan');
  const { error } = await sb.from('food_log').delete().eq('date', date).eq('source', 'plan');
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadDiary(date); hooks.render(); }
  return removed;   // handed back so the caller can offer undo
}

export async function restoreItems(items){
  if (!items || !items.length) return;
  setSyncStatus('saving');
  const { error } = await sb.from('food_log').insert(items.map(i => ({
    date:i.date, meal:i.meal, food_id:i.foodId ?? null, recipe_id:i.recipeId ?? null,
    name:i.name, qty:i.qty, unit:i.unit,
    kcal:i.kcal, protein:i.protein, fat:i.fat, carb:i.carb, source:i.source
  })));
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (!error) { await loadDiary(items[0].date); hooks.render(); }
}

// Fill the day. The weekly planner wins for any day it has meals for; the daily
// plan in use is the fallback. Never twice into the same day.
export async function autofillPlan(date){
  if (state.diary.some(d => d.source === 'plan')) return { added: 0, reason: 'Already autofilled' };

  let rows = [];
  const planned = await sb.from('planner_entries').select('*').eq('date', date).order('created_at');
  if (!planned.error && planned.data && planned.data.length) {
    rows = planned.data.map(e => ({
      date, meal: e.meal, food_id: null, recipe_id: e.recipe_id, name: e.name,
      qty: Number(e.servings) || 1, unit: 'serving',
      kcal: e.kcal, protein: e.protein, fat: e.fat, carb: e.carb, source: 'plan'
    }));
  } else {
    const plan = (state.plans || []).find(p => p.active);
    if (!plan) return { added: 0, reason: 'Nothing planned for this day and no daily plan in use' };
    for (const it of plan.items) {
      // Stored plan items carry recipe_id; the seed file's carry only a name.
      const r = (state.recipes || []).find(x => x.id === (it.recipe_id ?? it.recipeId) || x.name === it.name);
      if (!r) continue;
      rows.push({
        date, meal: it.meal, food_id: null, recipe_id: r.id, name: r.name,
        qty: 1, unit: 'serving',
        kcal: r.kcal, protein: r.protein, fat: r.fat, carb: r.carb, source: 'plan'
      });
    }
    if (!rows.length) return { added: 0, reason: 'Plan has no matching recipes' };
  }

  setSyncStatus('saving');
  const { error } = await sb.from('food_log').insert(rows);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (error) return { added: 0, reason: error.message };
  await loadDiary(date);
  hooks.render();
  return { added: rows.length };
}

export async function saveFood(f){
  setSyncStatus('saving');
  const row = {
    source:f.source, source_id:f.sourceId ?? null, name:f.name, brand:f.brand || null,
    serving_desc:f.servingDesc || null, serving_grams:f.servingGrams ?? null,
    kcal_100g:f.kcal100, protein_100g:f.protein100, fat_100g:f.fat100, carb_100g:f.carb100,
    favourite: !!f.favourite
  };
  // A lookup is cached once, not once per log entry. This used to be an upsert
  // on (source, source_id), but foods_source_unique is a PARTIAL index (where
  // source_id is not null) and PostgREST's on_conflict cannot target one — the
  // upsert failed on every call, so no searched food was ever saved (found
  // 2026-09-13 with an empty foods table). Look up first, then insert.
  let data = null, error = null;
  if (f.sourceId) {
    const found = await sb.from('foods').select('*')
      .eq('source', f.source).eq('source_id', f.sourceId).limit(1);
    if (found.error) error = found.error;
    else if (found.data && found.data.length) data = found.data[0];
  }
  if (!data && !error) ({ data, error } = await sb.from('foods').insert(row).select().single());
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (error) return null;
  await loadAll();
  return mapFood(data);
}

export async function toggleFavourite(id, on){
  const f = (state.foods || []).find(x => x.id === id);
  if (f) f.favourite = on;
  hooks.render();
  const { error } = await sb.from('foods').update({ favourite: on }).eq('id', id);
  if (error) setSyncStatus('error', error.message);
}

async function bumpFoodUse(id){
  const f = (state.foods || []).find(x => x.id === id);
  const next = (f ? f.useCount : 0) + 1;
  if (f) f.useCount = next;
  await sb.from('foods').update({ use_count: next }).eq('id', id);
}

// One-time cookbook import, same shape as the entries backfill: guarded per
// name so re-running cannot duplicate.
export async function seedCookbook(SEED_RECIPES, SEED_PLANS){
  setSyncStatus('importing');
  const have = new Set((state.recipes || []).map(r => r.name));
  const missing = SEED_RECIPES.filter(r => !have.has(r.name));
  if (missing.length) {
    const { error } = await sb.from('recipes').insert(missing.map(r => ({
      name:r.name, meal:r.meal, description:r.description, servings:r.servings,
      kcal:r.kcal, protein:r.protein, fat:r.fat, carb:r.carb,
      ingredients:r.ingredients, steps:r.steps, source:r.source
    })));
    if (error) { setSyncStatus('error', error.message); return { error: error.message }; }
  }
  await loadAll();

  const havePlans = new Set((state.plans || []).map(p => p.name));
  const missingPlans = SEED_PLANS.filter(p => !havePlans.has(p.name));
  if (missingPlans.length) {
    // Plans reference recipes by name in the seed file; resolve to ids now that
    // the recipes exist.
    const byName = new Map((state.recipes || []).map(r => [r.name, r.id]));
    const rows = missingPlans.map(p => ({
      name:p.name, description:p.description,
      kcal_target:p.kcalTarget, protein_target:p.proteinTarget,
      items: p.items.map(i => ({ meal:i.meal, name:i.name, recipe_id: byName.get(i.name) ?? null })),
      active: !!p.active
    }));
    const { error } = await sb.from('meal_plans').insert(rows);
    if (error) { setSyncStatus('error', error.message); return { error: error.message }; }
  }
  await loadAll();
  hooks.render();
  setSyncStatus('ok');
  return { recipes: missing.length, plans: missingPlans.length };
}

// ---------------------------------------------------------------------------
// extra_cal migration
// ---------------------------------------------------------------------------
// The diary becomes the intake source, so every historical day that carries a
// hand-typed extra_cal needs that figure preserved as one diary line — otherwise
// the whole camp's deficit history silently drops to the plan base.
//
// Idempotent: a day already holding a legacy row is skipped.
export async function migrateExtraCal(){
  const dates = Object.keys(state.entries).filter(d => Number(state.entries[d].extraCal) > 0);
  if (!dates.length) return { migrated: 0, skipped: 0 };

  setSyncStatus('importing');
  const { data: existing, error: exErr } = await sb.from('food_log')
    .select('date').eq('name', 'Extra calories (logged before the diary)');
  if (exErr) { setSyncStatus('error', exErr.message); return { error: exErr.message }; }
  const done = new Set((existing || []).map(r => r.date));

  const rows = dates.filter(d => !done.has(d)).map(d => ({
    date: d, meal: 'extra', name: 'Extra calories (logged before the diary)',
    qty: 1, unit: 'serving',
    kcal: Number(state.entries[d].extraCal) || 0,
    protein: 0, fat: 0, carb: 0, source: 'manual'
  }));
  if (!rows.length) { setSyncStatus('ok'); return { migrated: 0, skipped: dates.length }; }

  const { error } = await sb.from('food_log').insert(rows);
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  if (error) return { error: error.message };
  hooks.render();
  return { migrated: rows.length, skipped: dates.length - rows.length };
}

// Moved from fuel.js with the day plans. meal_plans_one_active enforces a single
// active plan, so clear first.
export async function activatePlan(id){
  setSyncStatus('saving');
  const off = await sb.from('meal_plans').update({ active: false }).neq('id', -1);
  const on = off.error ? off : await sb.from('meal_plans').update({ active: true }).eq('id', id);
  setSyncStatus(on.error ? 'error' : 'ok', on.error && on.error.message);
  await loadAll();
  hooks.render();
}

// ---------------------------------------------------------------------------
// Planner and groceries (supabase-phase6.sql)
// ---------------------------------------------------------------------------
// Loaded a week at a time, the way the diary is loaded a day at a time. null
// means the table is missing, which the screens say rather than showing an
// empty week.

function mapPlanner(r){
  return {
    id:r.id, date:r.date, meal:r.meal, recipeId:r.recipe_id, name:r.name,
    servings:Number(r.servings) || 1, kcal:Number(r.kcal) || 0,
    protein:Number(r.protein) || 0, fat:Number(r.fat) || 0, carb:Number(r.carb) || 0
  };
}

export async function loadWeek(monday){
  state.week = monday;
  const sunday = isoMinusDays(monday, -6);
  const [p, g] = await Promise.all([
    sb.from('planner_entries').select('*').gte('date', monday).lte('date', sunday)
      .order('date', { ascending: true }).order('created_at', { ascending: true }),
    sb.from('grocery_items').select('*').eq('week_start', monday).order('name', { ascending: true })
  ]);
  if (state.week !== monday) return;          // a different week was asked for meanwhile
  state.planner = p.error ? null : (p.data || []).map(mapPlanner);
  state.grocery = g.error ? null : (g.data || []).map(r => ({
    id:r.id, name:r.name, amount:r.amount || '', source:r.source, checked:!!r.checked
  }));
  hooks.render();
}

async function writeRows(q){
  setSyncStatus('saving');
  const { error } = await q;
  setSyncStatus(error ? 'error' : 'ok', error && error.message);
  return !error;
}

// Macros are written onto the planned row, like food_log: editing a recipe later
// must not rewrite a week already planned.
function plannerRow(date, meal, r, servings = 1){
  return {
    date, meal, recipe_id: r.id, name: r.name, servings,
    kcal: Number(r.kcal) * servings, protein: Number(r.protein) * servings,
    fat: Number(r.fat) * servings, carb: Number(r.carb) * servings
  };
}

export async function addPlannerEntry(date, meal, recipe){
  const ok = await writeRows(sb.from('planner_entries').insert(plannerRow(date, meal, recipe)));
  if (ok) await loadWeek(state.week);
  return ok;
}

export async function removePlannerEntry(id){
  const ok = await writeRows(sb.from('planner_entries').delete().eq('id', id));
  if (ok) await loadWeek(state.week);
  return ok;
}

// A day plan's meals copied into every day of the week. A slot already holding
// that same recipe is skipped, so pressing it twice changes nothing.
export async function applyPlanToWeek(plan, monday){
  const have = new Set((state.planner || []).map(e => `${e.date}|${e.meal}|${e.recipeId}`));
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const date = isoMinusDays(monday, -i);
    for (const it of plan.items) {
      const r = (state.recipes || []).find(x => x.id === (it.recipe_id ?? it.recipeId) || x.name === it.name);
      if (!r || have.has(`${date}|${it.meal}|${r.id}`)) continue;
      rows.push(plannerRow(date, it.meal, r));
    }
  }
  if (!rows.length) return 0;
  const ok = await writeRows(sb.from('planner_entries').insert(rows));
  if (ok) await loadWeek(monday);
  return ok ? rows.length : 0;
}

function itemKey(s){ return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Rebuilds the week's planner-sourced items from the planned recipes'
// ingredients. Items added by hand are never touched, and a ticked item stays
// ticked if it is still on the rebuilt list. Amounts are free text ("9 oz
// (255g)", "1 tbsp") and cannot be summed safely: identical amounts are counted,
// different ones are listed side by side.
export async function buildGroceries(monday){
  const groups = new Map();
  let meals = 0;
  for (const e of (state.planner || [])) {
    const r = e.recipeId && (state.recipes || []).find(x => x.id === e.recipeId);
    if (!r) continue;
    meals++;
    for (const ing of r.ingredients) {
      const key = itemKey(ing.item);
      if (!key) continue;
      const g = groups.get(key) || { name: String(ing.item).trim(), amounts: new Map() };
      const amount = String(ing.amount || '').trim();
      g.amounts.set(amount, (g.amounts.get(amount) || 0) + e.servings);
      groups.set(key, g);
    }
  }

  const ticked = new Set((state.grocery || [])
    .filter(i => i.source === 'planner' && i.checked).map(i => itemKey(i.name)));
  const rows = [...groups.entries()].map(([key, g]) => ({
    week_start: monday, name: g.name, source: 'planner', checked: ticked.has(key),
    amount: [...g.amounts]
      .map(([a, n]) => n > 1 ? `${a} ×${Math.round(n * 10) / 10}`.trim() : a)
      .filter(Boolean).join(' · ') || null
  }));

  if (!(await writeRows(sb.from('grocery_items').delete().eq('week_start', monday).eq('source', 'planner')))) {
    return { error: true };
  }
  if (rows.length && !(await writeRows(sb.from('grocery_items').insert(rows)))) return { error: true };
  await loadWeek(monday);
  return { items: rows.length, meals };
}

export async function addGrocery(monday, name){
  const ok = await writeRows(sb.from('grocery_items').insert({ week_start: monday, name, source: 'manual' }));
  if (ok) await loadWeek(monday);
  return ok;
}

export async function toggleGrocery(id, checked){
  const item = (state.grocery || []).find(x => x.id === id);
  if (item) { item.checked = checked; hooks.render(); }
  return writeRows(sb.from('grocery_items').update({ checked }).eq('id', id));
}

export async function removeGrocery(id){
  state.grocery = (state.grocery || []).filter(x => x.id !== id);
  hooks.render();
  return writeRows(sb.from('grocery_items').delete().eq('id', id));
}

export async function clearCheckedGroceries(monday){
  const ok = await writeRows(sb.from('grocery_items').delete().eq('week_start', monday).eq('checked', true));
  if (ok) await loadWeek(monday);
  return ok;
}

// The whole list for the week, hand-added items included.
export async function clearGroceries(monday){
  const ok = await writeRows(sb.from('grocery_items').delete().eq('week_start', monday));
  if (ok) await loadWeek(monday);
  return ok;
}

// Every planned meal Monday to Sunday. The diary is untouched: meals already
// filled into a day stay logged.
export async function clearPlannerWeek(monday){
  const ok = await writeRows(sb.from('planner_entries').delete()
    .gte('date', monday).lte('date', isoMinusDays(monday, -6)));
  if (ok) await loadWeek(monday);
  return ok;
}

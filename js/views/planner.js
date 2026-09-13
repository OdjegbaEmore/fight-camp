// Fuel · Planner and Groceries — a week of meals from the cookbook, and the
// shopping list built from it. Weeks run Monday to Sunday.

import { state, hooks } from '../state.js';
import { el, fmt, escapeAttr, todayISO, isoMinusDays, longDate, shortDate } from '../util.js';
import { MEALS } from '../config.js';
import {
  loadWeek, addPlannerEntry, removePlannerEntry, applyPlanToWeek, activatePlan, clearPlannerWeek,
  buildGroceries, addGrocery, toggleGrocery, removeGrocery, clearCheckedGroceries, clearGroceries
} from '../data.js';
import { tapConfirm } from '../tapconfirm.js';

let pick = null;          // { date, meal } while the recipe picker is open
let loadingWeek = false;
let note = '';            // one-line result of the last planner action
let groceryNote = '';

export function mondayOf(iso){
  const dow = (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
  return isoMinusDays(iso, dow);
}

function weekDates(monday){
  return [0, 1, 2, 3, 4, 5, 6].map(i => isoMinusDays(monday, -i));
}

function ensureWeek(){
  if (state.week || loadingWeek) return;
  loadingWeek = true;
  loadWeek(mondayOf(todayISO())).finally(() => { loadingWeek = false; });
}

function weekLabel(){
  const d = weekDates(state.week);
  return `${shortDate(d[0])} – ${shortDate(d[6])}${state.week === mondayOf(todayISO()) ? ' · this week' : ''}`;
}

const MISSING = `<div class="empty-note">The planner and grocery list need supabase-phase6.sql run in Supabase first.</div>`;

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------
export function renderPlanner(){
  ensureWeek();
  renderDayPlans();
  if (!state.week) { el('pw_label').textContent = '— —'; el('pw_days').innerHTML = ''; return; }

  el('pw_label').textContent = weekLabel();
  el('pw_note').textContent = note;
  el('pw_note').hidden = !note;
  el('pw_clear').hidden = !(state.planner && state.planner.length);
  if (state.planner === null) { el('pw_days').innerHTML = MISSING; return; }

  const today = todayISO();
  el('pw_days').innerHTML = weekDates(state.week).map(d => {
    const rows = state.planner.filter(e => e.date === d);
    const kcal = rows.reduce((a, e) => a + e.kcal, 0);
    return `
      <div class="card" style="margin-bottom:8px;${d === today ? ' border-color:var(--accent-line);' : ''}">
        <div class="row-between">
          <span class="listrow-t">${longDate(d)}${d === today ? ' · today' : ''}</span>
          <span class="lab">${rows.length ? fmt(kcal) + ' kcal' : ''}</span>
        </div>
        ${MEALS.map(m => {
          const items = rows.filter(e => e.meal === m.id);
          return `
          <div style="display:flex; align-items:flex-start; gap:8px; padding:7px 0; border-top:1px solid var(--line-soft);">
            <span class="lab" style="width:70px; flex:0 0 auto; padding-top:7px;">${m.label}</span>
            <div style="flex:1; min-width:0; padding-top:4px;">
              ${items.length ? items.map(e => `
                <div class="row-between" style="gap:6px; align-items:flex-start;">
                  <span style="font-size:13.5px; line-height:1.45;">${escapeAttr(e.name)} <span class="note-sm">${fmt(e.kcal)}</span></span>
                  <button class="btn-x" data-prm="${e.id}" type="button" aria-label="Remove ${escapeAttr(e.name)}">✕</button>
                </div>`).join('') : '<span class="note-sm">—</span>'}
            </div>
            <button class="btn-round" data-padd="${d}|${m.id}" type="button" aria-label="Add to ${m.label}, ${longDate(d)}">+</button>
          </div>`;
        }).join('')}
      </div>`;
  }).join('');

  el('pw_days').querySelectorAll('[data-prm]').forEach(b =>
    b.addEventListener('click', () => { note = ''; removePlannerEntry(Number(b.dataset.prm)); }));
  el('pw_days').querySelectorAll('[data-padd]').forEach(b =>
    b.addEventListener('click', () => {
      const [date, meal] = b.dataset.padd.split('|');
      pick = { date, meal };
      hooks.render();
    }));
}

// The day plans (meal_plans) live here now: "Use daily" makes one the diary's
// fallback, "Fill this week" copies its meals into every day of the shown week.
function renderDayPlans(){
  const ps = state.plans || [];
  el('pl_list').innerHTML = ps.length
    ? ps.map(p => `
        <div class="card" style="margin-bottom:10px;">
          <div class="row-between">
            <span class="listrow-t">${escapeAttr(p.name)}</span>
            ${p.active ? '<span class="chip auto">In use daily</span>' : `<button class="btn-quiet" data-activate="${p.id}" type="button">Use daily</button>`}
          </div>
          <div class="listrow-s" style="margin:4px 0 8px;">${escapeAttr(p.description || '')}</div>
          <div class="row-between">
            <span class="lab">${fmt(p.kcalTarget)} kcal · ${fmt(p.proteinTarget)}g protein · ${p.items.length} meals</span>
            ${state.planner ? `<button class="btn-quiet" data-apply="${p.id}" type="button">Fill this week</button>` : ''}
          </div>
        </div>`).join('')
    : `<div class="empty-note">No plans yet. Import the cookbook from the Cookbook tab to bring them in.</div>`;

  el('pl_list').querySelectorAll('[data-activate]').forEach(b =>
    b.addEventListener('click', () => activatePlan(Number(b.dataset.activate))));
  el('pl_list').querySelectorAll('[data-apply]').forEach(b =>
    b.addEventListener('click', async () => {
      const plan = ps.find(p => p.id === Number(b.dataset.apply));
      if (!plan || !state.week) return;
      const n = await applyPlanToWeek(plan, state.week);
      note = n ? `Added ${n} meals from ${plan.name} to this week.` : `${plan.name} is already in every day of this week.`;
      hooks.render();
    }));
}

export function renderPickSheet(){
  el('pickSheet').hidden = !pick;
  if (!pick) return;
  const label = (MEALS.find(m => m.id === pick.meal) || {}).label || '';
  el('pk_title').textContent = `${label} · ${longDate(pick.date)}`;

  const rs = (state.recipes || []).slice().sort((a, b) =>
    ((a.meal === pick.meal ? 0 : 1) - (b.meal === pick.meal ? 0 : 1)) || a.name.localeCompare(b.name));
  el('pk_list').innerHTML = rs.length
    ? rs.map(r => `
        <div class="listrow food-row" data-pick="${r.id}" role="button" tabindex="0">
          <div style="min-width:0;">
            <div class="listrow-t">${escapeAttr(r.name)}</div>
            <div class="listrow-s">${escapeAttr((MEALS.find(m => m.id === r.meal) || {}).label || 'Any meal')} · ${fmt(r.protein)}g protein</div>
          </div>
          <div class="listrow-v">${fmt(r.kcal)}</div>
        </div>`).join('')
    : `<div class="empty-note">The cookbook is empty. Import it from the Cookbook tab first.</div>`;

  el('pk_list').querySelectorAll('[data-pick]').forEach(row => {
    const choose = async () => {
      const p = pick;
      const r = rs.find(x => x.id === Number(row.dataset.pick));
      if (!p || !r) return;
      pick = null;
      note = '';
      hooks.render();
      await addPlannerEntry(p.date, p.meal, r);
    };
    row.addEventListener('click', choose);
    row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); } });
  });
}

// ---------------------------------------------------------------------------
// Groceries
// ---------------------------------------------------------------------------
export function renderGroceries(){
  ensureWeek();
  if (!state.week) { el('gw_label').textContent = '— —'; el('gr_list').innerHTML = ''; return; }
  el('gw_label').textContent = weekLabel();

  const ready = state.grocery !== null && state.planner !== null;
  el('gr_build').hidden = !ready;
  el('gr_addrow').hidden = !ready;
  if (!ready) {
    el('gr_list').innerHTML = MISSING;
    el('gr_clear').hidden = true;
    el('gr_clearall').hidden = true;
    el('gr_note').hidden = true;
    return;
  }

  const planned = state.planner.filter(e => e.recipeId).length;
  el('gr_note').textContent = groceryNote || (planned
    ? `${planned} planned ${planned === 1 ? 'meal' : 'meals'} this week.`
    : 'Nothing planned this week yet. Plan meals in Planner, or add items by hand.');
  el('gr_note').hidden = false;

  const items = state.grocery.slice().sort((a, b) => (a.checked - b.checked) || a.name.localeCompare(b.name));
  el('gr_list').innerHTML = items.length
    ? items.map(i => `
        <div class="listrow" style="gap:10px;">
          <button class="btn-round ${i.checked ? 'on' : ''}" data-gchk="${i.id}" type="button"
                  aria-label="${i.checked ? 'Untick' : 'Tick'} ${escapeAttr(i.name)}" aria-pressed="${i.checked}">${i.checked ? '✓' : ''}</button>
          <div style="flex:1; min-width:0;">
            <div class="listrow-t" style="font-size:15px;${i.checked ? ' text-decoration:line-through; color:var(--muted);' : ''}">${escapeAttr(i.name)}</div>
            ${(i.amount || i.source === 'manual') ? `<div class="listrow-s">${escapeAttr(i.amount)}${i.source === 'manual' ? (i.amount ? ' · ' : '') + 'added by you' : ''}</div>` : ''}
          </div>
          <button class="btn-x" data-grm="${i.id}" type="button" aria-label="Remove ${escapeAttr(i.name)}">✕</button>
        </div>`).join('')
    : `<div class="empty-note">The list is empty.</div>`;
  el('gr_clear').hidden = !items.some(i => i.checked);
  el('gr_clearall').hidden = !items.length;

  el('gr_list').querySelectorAll('[data-gchk]').forEach(b =>
    b.addEventListener('click', () => {
      const i = items.find(x => x.id === Number(b.dataset.gchk));
      if (i) toggleGrocery(i.id, !i.checked);
    }));
  el('gr_list').querySelectorAll('[data-grm]').forEach(b =>
    b.addEventListener('click', () => removeGrocery(Number(b.dataset.grm))));
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
export function wirePlanner(){
  const shift = weeks => {
    if (!state.week) return;
    note = ''; groceryNote = '';
    loadWeek(isoMinusDays(state.week, -7 * weeks));
  };
  el('pw_prev').addEventListener('click', () => shift(-1));
  el('pw_next').addEventListener('click', () => shift(1));
  el('gw_prev').addEventListener('click', () => shift(-1));
  el('gw_next').addEventListener('click', () => shift(1));

  const closePick = () => { pick = null; hooks.render(); };
  el('pk_close').addEventListener('click', closePick);
  el('pk_backdrop').addEventListener('click', closePick);

  el('gr_build').addEventListener('click', async () => {
    if (!state.week) return;
    const r = await buildGroceries(state.week);
    groceryNote = r.error ? 'Could not build the list — check the sync status.'
      : r.items ? `Built ${r.items} items from ${r.meals} planned ${r.meals === 1 ? 'meal' : 'meals'}.`
      : 'No planned recipes this week to build from.';
    hooks.render();
  });

  const addItem = async () => {
    const name = el('gr_new').value.trim();
    if (!name || !state.week) return;
    el('gr_new').value = '';
    await addGrocery(state.week, name);
  };
  el('gr_add').addEventListener('click', addItem);
  el('gr_new').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); addItem(); } });

  el('gr_clear').addEventListener('click', () =>
    tapConfirm(el('gr_clear'), 'Tap again to clear', () => clearCheckedGroceries(state.week)));

  el('gr_clearall').addEventListener('click', () =>
    tapConfirm(el('gr_clearall'), 'Tap again to clear all', () => {
      groceryNote = '';
      clearGroceries(state.week);
    }));

  el('pw_clear').addEventListener('click', () =>
    tapConfirm(el('pw_clear'), 'Tap again to clear the week', () => {
      note = 'Week cleared. Meals already filled into the diary stay logged.';
      clearPlannerWeek(state.week);
    }));
}

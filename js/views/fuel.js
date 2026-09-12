// Fuel — food diary, add food, cookbook, meal plans.

import { state, hooks } from '../state.js';
import { el, fmt, shortDate, escapeAttr, todayISO } from '../util.js';
import { MEALS } from '../config.js';
import {
  loadDiary, addDiaryItem, removeDiaryItem, clearPlanItems, restoreItems,
  autofillPlan, saveFood, toggleFavourite, seedCookbook
} from '../data.js';
import { searchFoods, portionMacros } from '../foodsearch.js';
import { SEED_RECIPES, SEED_PLANS } from '../seed-fuel.js';

let pane = 'diary';           // diary | cookbook | plans
let addOpen = false;
let addTab = 'favourites';    // favourites | search  (barcode is cut)
let searchResults = [];
let searchNotes = [];
let searching = false;
let pendingFood = null;       // food chosen, awaiting portion
let openRecipeId = null;
let undoBuffer = null;        // rows removed by Clear plan
let searchAbort = null;

export function renderFuel(){
  el('fu_seg').querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', b.dataset.pane === pane));
  ['diary','cookbook','plans'].forEach(p => el('fu_' + p).hidden = (p !== pane));

  if (pane === 'diary') renderDiary();
  else if (pane === 'cookbook') renderCookbook();
  else renderPlans();

  el('addSheet').hidden = !addOpen;
  if (addOpen) renderAdd();
  el('recipeSheet').hidden = openRecipeId === null;
  if (openRecipeId !== null) renderRecipe();
}

function setPane(p){ pane = p; hooks.render(); }

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------
function totals(){
  return state.diary.reduce((a,d) => ({
    kcal:a.kcal + Number(d.kcal||0), protein:a.protein + Number(d.protein||0),
    fat:a.fat + Number(d.fat||0), carb:a.carb + Number(d.carb||0)
  }), { kcal:0, protein:0, fat:0, carb:0 });
}

function renderDiary(){
  const date = state.diaryDate || todayISO();
  const t = totals();
  const plan = (state.plans || []).find(p => p.active);
  const target = plan && plan.kcalTarget ? Number(plan.kcalTarget) : null;

  el('fu_date').textContent = shortDate(date);
  el('fu_intake').textContent = fmt(t.kcal);
  el('fu_target').textContent = target ? `/ ${fmt(target)} kcal` : '/ no plan target';
  el('fu_left').textContent = target
    ? (target - t.kcal >= 0 ? `${fmt(target - t.kcal)} left` : `${fmt(t.kcal - target)} over`)
    : '';
  el('fu_bar').style.width = target ? Math.min(100, (t.kcal / target) * 100) + '%' : '0%';
  el('fu_macros').textContent =
    `P ${fmt(t.protein,0)} g · F ${fmt(t.fat,0)} g · C ${fmt(t.carb,0)} g`;

  // Plan autofill bar — only while a plan is active.
  const planned = state.diary.filter(d => d.source === 'plan');
  el('fu_planbar').hidden = !plan;
  if (plan) {
    el('fu_planname').textContent = planned.length
      ? `${plan.name} autofilled · ${planned.length} ${planned.length === 1 ? 'meal' : 'meals'}`
      : `${plan.name} · not filled in yet`;
    el('fu_planhint').textContent = planned.length
      ? 'Clear any meal you swapped out today.'
      : 'Fill the day from the plan, then edit what changed.';
    el('fu_planclear').hidden = !planned.length;
    el('fu_planfill').hidden = !!planned.length;
  }

  // Meals
  el('fu_meals').innerHTML = MEALS.map(m => {
    const items = state.diary.filter(d => d.meal === m.id);
    const sub = items.reduce((a,d) => a + Number(d.kcal||0), 0);
    return `
      <div class="meal-group">
        <div class="row-between" style="padding:8px 0;">
          <span class="lab">${m.label}${items.length ? ' · ' + fmt(sub) : ''}</span>
          <button class="btn-x meal-add" data-meal="${m.id}" type="button" aria-label="Add to ${m.label}">+</button>
        </div>
        ${items.length ? items.map(d => `
          <div class="listrow">
            <div style="min-width:0;">
              <div class="listrow-t">${escapeAttr(d.name)}</div>
              <div class="listrow-s">${d.source === 'plan' ? 'From plan' : d.source === 'recipe' ? 'Recipe' : 'Logged'}${
                d.unit === 'g' ? ' · ' + fmt(d.qty) + ' g' : (Number(d.qty) !== 1 ? ' · ×' + fmt(d.qty,1) : '')
              }</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex:0 0 auto;">
              <span class="listrow-v">${fmt(d.kcal)}</span>
              <button class="btn-round" data-rm="${d.id}" type="button" aria-label="Remove ${escapeAttr(d.name)}">✕</button>
            </div>
          </div>`).join('') : `<div class="empty-note" style="padding:4px 0 10px;">Nothing logged.</div>`}
      </div>`;
  }).join('');

  el('fu_meals').querySelectorAll('[data-rm]').forEach(b =>
    b.addEventListener('click', () => removeDiaryItem(Number(b.dataset.rm), date)));
  el('fu_meals').querySelectorAll('.meal-add').forEach(b =>
    b.addEventListener('click', () => openAdd(b.dataset.meal)));
}

// ---------------------------------------------------------------------------
// Add food
// ---------------------------------------------------------------------------
let addMeal = 'extra';

export function openAdd(meal){
  addMeal = meal || 'extra';
  addOpen = true;
  pendingFood = null;
  hooks.render();
}
function closeAdd(){ addOpen = false; pendingFood = null; hooks.render(); }

function renderAdd(){
  el('add_meal').textContent = (MEALS.find(m => m.id === addMeal) || {}).label || 'Extra';
  el('add_seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === addTab));
  el('add_fav').hidden = addTab !== 'favourites';
  el('add_search').hidden = addTab !== 'search';

  // Portion step takes over once a food is chosen.
  el('add_portion').hidden = !pendingFood;
  el('add_browse').hidden = !!pendingFood;
  if (pendingFood) { renderPortion(); return; }

  if (addTab === 'favourites') {
    const favs = (state.foods || [])
      .slice().sort((a,b) => (b.favourite - a.favourite) || (b.useCount - a.useCount));
    el('fav_list').innerHTML = favs.length
      ? favs.slice(0,25).map(f => rowFor(f)).join('')
      : `<div class="empty-note">Nothing saved yet. Search for a food and it lands here.</div>`;
    wireRows(el('fav_list'), favs);
  } else {
    el('search_notes').textContent = searchNotes.join(' · ');
    el('search_notes').hidden = !searchNotes.length;
    el('search_status').textContent = searching ? 'Searching…' : '';
    el('search_list').innerHTML = searchResults.length
      ? searchResults.map(f => rowFor(f)).join('')
      : (searching ? '' : `<div class="empty-note">Type at least two letters.</div>`);
    wireRows(el('search_list'), searchResults);
  }
}

function rowFor(f){
  const id = f.id != null ? `db-${f.id}` : `new-${f.source}-${f.sourceId}`;
  return `
    <div class="listrow food-row" data-fid="${id}" role="button" tabindex="0">
      <div style="min-width:0;">
        <div class="listrow-t">${escapeAttr(f.name)}</div>
        <div class="listrow-s">${escapeAttr(f.brand || (f.source === 'usda' ? 'USDA' : f.source === 'off' ? 'Open Food Facts' : 'Custom'))} · ${fmt(f.kcal100)} kcal/100g</div>
      </div>
      ${f.id != null ? `<button class="btn-round ${f.favourite ? 'on' : ''}" data-fav="${f.id}" type="button" aria-label="Favourite">${f.favourite ? '★' : '☆'}</button>` : ''}
    </div>`;
}

function wireRows(wrap, pool){
  wrap.querySelectorAll('[data-fid]').forEach(row => {
    const pick = ev => {
      if (ev.target.closest('[data-fav]')) return;
      const key = row.dataset.fid;
      const f = key.startsWith('db-')
        ? pool.find(x => x.id === Number(key.slice(3)))
        : pool.find(x => `new-${x.source}-${x.sourceId}` === key);
      if (f) { pendingFood = f; hooks.render(); }
    };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(ev); } });
  });
  wrap.querySelectorAll('[data-fav]').forEach(b =>
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      const id = Number(b.dataset.fav);
      const f = (state.foods || []).find(x => x.id === id);
      toggleFavourite(id, !(f && f.favourite));
    }));
}

function renderPortion(){
  const f = pendingFood;
  el('p_name').textContent = f.name;
  el('p_sub').textContent = `${fmt(f.kcal100)} kcal · P ${fmt(f.protein100,1)} · F ${fmt(f.fat100,1)} · C ${fmt(f.carb100,1)} per 100g`;
  const unit = el('p_unit').value;
  const qty = Number(el('p_qty').value) || 0;
  const m = portionMacros(f, qty, unit);
  el('p_kcal').textContent = fmt(m.kcal);
  el('p_macros').textContent = `P ${fmt(m.protein,1)} g · F ${fmt(m.fat,1)} g · C ${fmt(m.carb,1)} g`;
  el('p_servinghint').textContent = f.servingGrams
    ? `1 serving ≈ ${fmt(f.servingGrams)} g${f.servingDesc ? ' · ' + f.servingDesc : ''}`
    : 'Grams only — no serving size known';
}

export function wireFuel(){
  el('fu_seg').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-pane]'); if (b) setPane(b.dataset.pane);
  });

  el('fu_addBtn').addEventListener('click', () => openAdd('extra'));
  el('fu_copyBtn').addEventListener('click', copyYesterday);

  el('fu_planfill').addEventListener('click', async () => {
    const r = await autofillPlan(state.diaryDate || todayISO());
    if (!r.added && r.reason) toast(r.reason);
  });

  el('fu_planclear').addEventListener('click', async () => {
    // Undo rather than a confirm dialog — the handoff is explicit about this.
    undoBuffer = await clearPlanItems(state.diaryDate || todayISO());
    if (undoBuffer && undoBuffer.length) toast(`Cleared ${undoBuffer.length} plan meals`, 'Undo', async () => {
      await restoreItems(undoBuffer); undoBuffer = null;
    });
  });

  el('add_close').addEventListener('click', closeAdd);
  el('add_backdrop').addEventListener('click', closeAdd);
  el('add_seg').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-tab]'); if (!b) return;
    addTab = b.dataset.tab; hooks.render();
    if (addTab === 'search') setTimeout(() => el('add_q').focus(), 50);
  });

  let debounce = null;
  el('add_q').addEventListener('input', function(){
    const q = this.value;
    clearTimeout(debounce);
    if (searchAbort) searchAbort.abort();
    debounce = setTimeout(async () => {
      if (q.trim().length < 2) { searchResults = []; searchNotes = []; hooks.render(); return; }
      searching = true; hooks.render();
      searchAbort = new AbortController();
      try {
        const r = await searchFoods(q, searchAbort.signal);
        searchResults = r.results; searchNotes = r.notes;
      } catch(e) { searchNotes = [e.message]; }
      searching = false; hooks.render();
    }, 350);
  });

  el('p_back').addEventListener('click', () => { pendingFood = null; hooks.render(); });
  el('p_qty').addEventListener('input', renderPortion);
  el('p_unit').addEventListener('change', renderPortion);

  el('p_add').addEventListener('click', async () => {
    const f = pendingFood; if (!f) return;
    const unit = el('p_unit').value;
    const qty = Number(el('p_qty').value) || 1;
    const m = portionMacros(f, qty, unit);
    // A searched food is saved to the pantry on first use, so the next time it
    // is one tap from favourites rather than another lookup.
    let foodId = f.id;
    if (foodId == null) { const saved = await saveFood(f); foodId = saved ? saved.id : null; }
    await addDiaryItem({
      date: state.diaryDate || todayISO(), meal: addMeal, foodId,
      name: f.name, qty, unit, ...m, source: 'manual'
    });
    closeAdd();
  });
}

async function copyYesterday(){
  const date = state.diaryDate || todayISO();
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() - 1);
  const prev = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const today = state.diary.slice();
  await loadDiary(prev);
  const rows = state.diary.map(x => ({ ...x, date }));
  await loadDiary(date);
  if (!rows.length) { toast('Nothing logged yesterday'); return; }
  await restoreItems(rows);
  toast(`Copied ${rows.length} items from ${shortDate(prev)}`);
}

// ---------------------------------------------------------------------------
// Cookbook
// ---------------------------------------------------------------------------
function renderCookbook(){
  const rs = state.recipes || [];
  el('cb_count').textContent = rs.length ? `${rs.length} recipes` : '— —';
  el('cb_seed').hidden = rs.length > 0;

  el('cb_list').innerHTML = rs.length
    ? MEALS.map(m => {
        const group = rs.filter(r => r.meal === m.id);
        if (!group.length) return '';
        return `<div class="lab" style="padding:10px 0 2px;">${m.label}</div>` + group.map(r => `
          <div class="listrow" data-recipe="${r.id}" role="button" tabindex="0">
            <div style="min-width:0;">
              <div class="listrow-t">${escapeAttr(r.name)}</div>
              <div class="listrow-s">${fmt(r.protein)}g protein · ${escapeAttr(r.source || '')}</div>
            </div>
            <div class="listrow-v">${fmt(r.kcal)}</div>
          </div>`).join('');
      }).join('')
    : `<div class="empty-note">No recipes yet.</div>`;

  el('cb_list').querySelectorAll('[data-recipe]').forEach(row => {
    const open = () => { openRecipeId = Number(row.dataset.recipe); hooks.render(); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  });
}

function renderRecipe(){
  const r = (state.recipes || []).find(x => x.id === openRecipeId);
  if (!r) { openRecipeId = null; return; }
  el('r_name').textContent = r.name;
  el('r_macros').textContent = `${fmt(r.kcal)} cal · ${fmt(r.protein)}g protein · ${fmt(r.fat)}g fat · ${fmt(r.carb)}g carb`;
  el('r_desc').textContent = r.description || '';
  el('r_desc').hidden = !r.description;
  el('r_ing').innerHTML = r.ingredients.map(i => `
    <div class="listrow">
      <div class="listrow-t" style="font-size:15px;">${escapeAttr(i.item)}</div>
      <div class="listrow-s" style="text-align:right; flex:0 0 auto; max-width:52%;">${escapeAttr(i.amount)}</div>
    </div>`).join('');
  el('r_steps').innerHTML = r.steps.length
    ? r.steps.map((s,i) => `<div class="step-row"><span class="step-n">${i+1}</span><span>${escapeAttr(s)}</span></div>`).join('')
    : `<div class="empty-note">No method — it's an assembly job.</div>`;
  el('r_steps_lab').hidden = !r.steps.length;
}

export function wireCookbook(){
  el('r_close').addEventListener('click', () => { openRecipeId = null; hooks.render(); });
  el('r_backdrop').addEventListener('click', () => { openRecipeId = null; hooks.render(); });

  el('r_add').addEventListener('click', async () => {
    const r = (state.recipes || []).find(x => x.id === openRecipeId);
    if (!r) return;
    await addDiaryItem({
      date: state.diaryDate || todayISO(), meal: r.meal || 'extra', recipeId: r.id,
      name: r.name, qty: 1, unit: 'serving',
      kcal: r.kcal, protein: r.protein, fat: r.fat, carb: r.carb, source: 'recipe'
    });
    openRecipeId = null;
    pane = 'diary';
    hooks.render();
  });

  el('cb_seed').addEventListener('click', async () => {
    const r = await seedCookbook(SEED_RECIPES, SEED_PLANS);
    toast(r.error ? r.error : `Imported ${r.recipes} recipes and ${r.plans} plans`);
  });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
function renderPlans(){
  const ps = state.plans || [];
  el('pl_list').innerHTML = ps.length
    ? ps.map(p => `
        <div class="card" style="margin-bottom:10px;">
          <div class="row-between">
            <span class="listrow-t">${escapeAttr(p.name)}</span>
            ${p.active ? '<span class="chip auto">Active</span>' : `<button class="btn-quiet" data-activate="${p.id}" type="button">Use this</button>`}
          </div>
          <div class="listrow-s" style="margin:4px 0 8px;">${escapeAttr(p.description || '')}</div>
          <div class="row-between">
            <span class="lab">${fmt(p.kcalTarget)} kcal · ${fmt(p.proteinTarget)}g protein</span>
            <span class="lab">${p.items.length} meals</span>
          </div>
        </div>`).join('')
    : `<div class="empty-note">No plans yet. Import the cookbook to bring both in.</div>`;

  el('pl_list').querySelectorAll('[data-activate]').forEach(b =>
    b.addEventListener('click', () => activatePlan(Number(b.dataset.activate))));
}

async function activatePlan(id){
  const { sb } = await import('../state.js');
  // meal_plans_one_active enforces a single active plan, so clear first.
  await sb.from('meal_plans').update({ active: false }).neq('id', -1);
  await sb.from('meal_plans').update({ active: true }).eq('id', id);
  const { loadAll } = await import('../data.js');
  await loadAll();
  hooks.render();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function toast(msg, actionLabel, action){
  const t = el('toast');
  el('toast_msg').textContent = msg;
  const btn = el('toast_action');
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || '';
  btn.onclick = action ? () => { action(); t.hidden = true; } : null;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 7000 : 3000);
}

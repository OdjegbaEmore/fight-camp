// Progress — weight & DEXA, and camps: start, end, remove, and a look back at
// any camp's chart and numbers. Also the entry point for the daily weigh-in sheet.

import { sb, state, hooks } from '../state.js';
import { el, fmt, shortDate, longDate, escapeAttr, todayISO } from '../util.js';
import { C } from '../config.js';
import { deleteDexa, upsertEntry, saveCamp, deleteCamp } from '../data.js';
import {
  latestWeight, weighedDatesBetween, baselineWeight, campMode, chartRange,
  campsSorted, campStats
} from '../calc.js';
import { openEntry } from './entry.js';
import { tapConfirm } from '../tapconfirm.js';

let weightChart = null, campChart = null;
let formMode = null;       // null | 'start' | 'edit'
let openCampId = null;     // camp shown in the look-back sheet

export function resizeCharts(){
  if (weightChart) weightChart.resize();
}

export function renderProgress(){
  const range = chartRange();
  const lw = latestWeight();
  const base = baselineWeight();

  el('p_weight').textContent = lw ? fmt(lw.weight,1) : '—';
  const delta = (lw && base) ? lw.weight - base.weight : null;
  el('p_delta').textContent = delta !== null
    ? `${delta <= 0 ? '−' : '+'}${fmt(Math.abs(delta),1)} LB` : '';

  const wDates = weighedDatesBetween(range.from, range.to);
  el('p_range').textContent = wDates.length
    ? `${shortDate(wDates[0])} → ${shortDate(wDates[wDates.length-1])}`
    : range.label;
  el('p_scope').textContent = range.label;

  // Rate: lb/week across the weighed span inside the current range.
  let rate = null;
  if (wDates.length > 1) {
    const a = { d: wDates[0], w: Number(state.entries[wDates[0]].weight) };
    const b = { d: wDates[wDates.length-1], w: Number(state.entries[wDates[wDates.length-1]].weight) };
    const days = (new Date(b.d) - new Date(a.d))/86400000;
    if (days > 0) rate = ((a.w - b.w)/days) * 7;
  }

  const cm = campMode();
  const logged = wDates.length;
  const scans = (state.dexaScans||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const dexa = scans.length ? scans[scans.length-1] : null;
  const dexaFirst = scans.length ? scans[0] : null;
  const leanDelta = (dexa && dexaFirst && dexa !== dexaFirst) ? dexa.lean - dexaFirst.lean : null;
  const bfDelta   = (dexa && dexaFirst && dexa !== dexaFirst) ? dexa.bf - dexaFirst.bf : null;

  el('p_grid').innerHTML = `
    <div>
      <div class="lab">Rate</div>
      <div class="cell-v">${rate !== null ? (rate >= 0 ? '−' : '+') + fmt(Math.abs(rate),1) : '—'} <small>lb/wk</small></div>
      <div class="cell-n">${range.scope === 'camp' ? 'Weighed days in camp' : 'Weighed days in window'}</div>
    </div>
    <div>
      <div class="lab">Weigh-ins</div>
      <div class="cell-v">${logged}${cm.active ? ` <small>/ ${cm.dayIndex}</small>` : ''}</div>
      <div class="cell-n">${cm.active ? 'Camp days recorded' : 'In the last 90 days'}</div>
    </div>
    <div>
      <div class="lab">Baseline</div>
      <div class="cell-v">${base ? fmt(base.weight,1) : '—'} <small>lb</small></div>
      <div class="cell-n">${base ? shortDate(base.date) : 'No baseline yet'}</div>
    </div>
    <div>
      <div class="lab">Lean mass</div>
      <div class="cell-v">${dexa ? fmt(dexa.lean,1) : '—'} <small>lb</small></div>
      <div class="cell-n">${dexa
        ? fmt(dexa.bf,1) + '% body fat'
          + (bfDelta !== null ? ` · ${bfDelta <= 0 ? '−' : '+'}${fmt(Math.abs(bfDelta),1)} pts` : '')
          + (leanDelta !== null ? ` · lean ${leanDelta <= 0 ? '−' : '+'}${fmt(Math.abs(leanDelta),1)} lb` : '')
        : 'No scan logged'}</div>
    </div>`;

  const ctx = el('weightChart');
  if (weightChart) { weightChart.destroy(); weightChart = null; }
  if (wDates.length) weightChart = weightLine(ctx, wDates);
  else ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height);

  renderDexaTable();
  renderCampPanel();
  renderCampSheet();
}

function weightLine(canvas, dates){
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates.map(shortDate),
      datasets: [{
        label: 'Mass (lb)',
        data: dates.map(d => Number(state.entries[d].weight)),
        borderColor: C.accent,
        backgroundColor: 'rgba(239,112,89,0.10)',
        fill: true, tension: 0, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: C.accent
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid:{ color:C.grid }, ticks:{ color:C.muted, font:{ family:'Barlow Condensed', size:12 } }, border:{ display:false } },
        x: { grid:{ display:false }, ticks:{ color:C.muted, font:{ family:'Barlow Condensed', size:11 }, maxRotation:0, autoSkipPadding:16 }, border:{ color:C.grid } }
      }
    }
  });
}

function renderDexaTable(){
  const body = el('dexaBody');
  const scans = (state.dexaScans||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  if (scans.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty-note">No DEXA scans logged.</td></tr>`;
    return;
  }
  body.innerHTML = scans.map(s => `
    <tr>
      <td>${shortDate(s.date)}</td>
      <td class="note-cell">${escapeAttr(s.label||'')}</td>
      <td>${fmt(s.weight,1)}</td>
      <td>${fmt(s.bf,1)}%</td>
      <td>${fmt(s.lean,1)}</td>
      <td><button class="btn-x" data-ddel="${s.id}" aria-label="Delete scan">✕</button></td>
    </tr>`).join('');
  body.querySelectorAll('[data-ddel]').forEach(btn => {
    btn.addEventListener('click', () => deleteDexa(Number(btn.getAttribute('data-ddel'))));
  });
}

// ---------------------------------------------------------------------------
// Camps
// ---------------------------------------------------------------------------
const sign1 = v => `${v <= 0 ? '−' : '+'}${fmt(Math.abs(v),1)}`;

function renderCampPanel(){
  const cm = campMode();
  const today = todayISO();
  const camps = campsSorted();

  el('cm_state').textContent = cm.active ? `Day ${cm.dayIndex} of ${cm.dayCount}` : 'No camp running';
  el('cm_current').hidden = !cm.active || formMode !== null;
  el('cm_start_btn').hidden = cm.active || formMode !== null;
  el('cm_form').hidden = formMode === null;
  el('cm_save').textContent = formMode === 'edit' ? 'Save changes' : 'Start camp';

  if (cm.active) {
    const c = cm.camp;
    el('cm_cur_name').textContent = c.name;
    el('cm_cur_dates').textContent = `${shortDate(c.startDate)} → ${shortDate(c.endDate)} · ${cm.daysOut} ${cm.daysOut === 1 ? 'day' : 'days'} left`
      + (c.targetWeight ? ` · target ${fmt(c.targetWeight,1)} lb` : '');
    el('cm_cur_bar').style.width = cm.pct + '%';
  }

  // Everything except the running camp, newest first.
  const others = camps.filter(c => !(cm.active && c.id === cm.camp.id)).reverse();
  el('cm_list').innerHTML = others.length
    ? others.map(c => {
        const s = campStats(c);
        const upcoming = c.startDate > today;
        return `
        <div class="listrow" data-camp="${c.id}" role="button" tabindex="0" style="cursor:pointer;">
          <div style="min-width:0;">
            <div class="listrow-t">${escapeAttr(c.name)}</div>
            <div class="listrow-s">${shortDate(c.startDate)} → ${shortDate(c.endDate)} · ${s.dayCount} days${upcoming ? ' · upcoming' : ''}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex:0 0 auto;">
            <span class="listrow-v" style="font-size:17px;">${!upcoming && s.change !== null ? sign1(s.change) + ' lb' : ''}</span>
            <button class="btn-quiet" data-cdel="${c.id}" type="button">Remove</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty-note">No past camps.</div>`;

  el('cm_list').querySelectorAll('[data-camp]').forEach(row => {
    const open = ev => { if (ev.target.closest('[data-cdel]')) return; openCampId = Number(row.dataset.camp); hooks.render(); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(ev); } });
  });
  el('cm_list').querySelectorAll('[data-cdel]').forEach(btn =>
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      tapConfirm(btn, 'Tap to confirm', () => deleteCamp(Number(btn.dataset.cdel)));
    }));
}

function renderCampSheet(){
  const camp = openCampId !== null ? campsSorted().find(c => c.id === openCampId) : null;
  el('campSheet').hidden = !camp;
  if (!camp) {
    openCampId = null;
    if (campChart) { campChart.destroy(); campChart = null; }
    return;
  }

  const s = campStats(camp);
  const today = todayISO();
  const over = camp.archived || camp.endDate < today;
  el('cs_name').textContent = camp.name;
  el('cs_dates').textContent = `${longDate(camp.startDate)} → ${longDate(camp.endDate)} · ${s.dayCount} days`
    + (!s.started ? ' · upcoming' : over ? ' · ended' : ' · running');

  const cell = (lab, val, note, accent) => `
    <div>
      <div class="lab">${lab}</div>
      <div class="cell-v"${accent ? ' style="color:var(--accent);"' : ''}>${val}</div>
      <div class="cell-n">${note || ''}</div>
    </div>`;

  const target = camp.targetWeight ? Number(camp.targetWeight) : null;
  const targetNote = target === null ? 'No target set'
    : s.last ? (s.last.weight <= target ? `Target ${fmt(target,1)} reached` : `${fmt(s.last.weight - target,1)} lb from ${fmt(target,1)} target`)
    : `Target ${fmt(target,1)} lb`;

  el('cs_weight').innerHTML = !s.started
    ? cell('Starts', shortDate(camp.startDate), 'Nothing to show yet') + cell('Target', target ? `${fmt(target,1)} <small>lb</small>` : '—', '')
    : cell('Start', s.first ? `${fmt(s.first.weight,1)} <small>lb</small>` : '—', s.first ? shortDate(s.first.date) : 'No weigh-in')
      + cell(over ? 'End' : 'Latest', s.last ? `${fmt(s.last.weight,1)} <small>lb</small>` : '—', s.last ? shortDate(s.last.date) : 'No weigh-in')
      + cell('Change', s.change !== null ? `${sign1(s.change)} <small>lb</small>` : '—', targetNote, true)
      + cell('Rate', s.rate !== null ? `${s.rate >= 0 ? '−' : '+'}${fmt(Math.abs(s.rate),1)} <small>lb/wk</small>` : '—',
             `${s.weighed} weigh-ins over ${s.daysDone} ${s.daysDone === 1 ? 'day' : 'days'}`);

  el('cs_train').innerHTML = !s.started ? '' :
      cell('Avg deficit', s.avgDeficit !== null ? `${fmt(s.avgDeficit)} <small>kcal/day</small>` : '—',
           `${s.loggedDays} logged ${s.loggedDays === 1 ? 'day' : 'days'}`)
    + cell('Total deficit', s.loggedDays ? `${fmt(s.totalDeficit)} <small>kcal</small>` : '—',
           s.loggedDays ? `≈ ${fmt(s.totalDeficit / 3500,1)} lb at 3,500 kcal/lb` : '')
    + cell('Myzone', `${s.sessions} <small>sessions</small>`, `${fmt(s.minutes / 60,1)} hours · ${fmt(s.trainingKcal)} kcal`)
    + cell('Round timer', `${s.timerSessions} <small>sessions</small>`, 'Template sessions run');
  el('cs_train').hidden = !s.started;
  el('cs_train_lab').hidden = !s.started;

  el('cs_dexa_lab').hidden = !s.scans.length;
  el('cs_dexa').innerHTML = s.scans.map(d => `
    <div class="listrow">
      <div>
        <div class="listrow-t">${escapeAttr(d.label || 'DEXA scan')}</div>
        <div class="listrow-s">${shortDate(d.date)} · ${fmt(d.weight,1)} lb · lean ${fmt(d.lean,1)} lb</div>
      </div>
      <div class="listrow-v">${fmt(d.bf,1)}<small style="font-size:12px; color:var(--muted);">%</small></div>
    </div>`).join('');

  // The canvas has no size until the sheet is visible, so draw on the next frame.
  const has = s.weighedDates.length > 0;
  el('cs_chartbox').hidden = !has;
  el('cs_chartnote').hidden = has;
  const id = camp.id;
  requestAnimationFrame(() => {
    if (campChart) { campChart.destroy(); campChart = null; }
    if (openCampId === id && has) campChart = weightLine(el('campChart'), s.weighedDates);
  });
}

function fillForm(c){
  el('cm_id').value = c ? c.id : '';
  el('cm_name').value = c ? c.name : '';
  el('cm_start').value = c ? c.startDate : todayISO();
  el('cm_end').value = c ? c.endDate : '';
  el('cm_target').value = c && c.targetWeight != null ? c.targetWeight : '';
  showErr('');
}

function showErr(msg){
  el('cm_err').textContent = msg;
  el('cm_err').hidden = !msg;
}

export function startCampForm(){
  formMode = 'start';
  fillForm(null);
  hooks.render();
  setTimeout(() => el('cm_name').focus(), 50);
}

export function wireProgress(){
  el('p_logBtn').addEventListener('click', () => openEntry(todayISO()));

  el('addDexaBtn').addEventListener('click', async function(){
    const d = el('d_date').value;
    if (!d) return;
    const scan = {
      date: d,
      label: el('d_label').value || 'DEXA Scan',
      weight: Number(el('d_weight').value || 0),
      bf: Number(el('d_bf').value || 0),
      lean: Number(el('d_lean').value || 0)
    };
    const { data, error } = await sb.from('dexa_scans').insert(scan).select().single();
    if (error) return;
    state.dexaScans.push(data);
    if (!state.entries[d]) {
      await upsertEntry(d, { weight: scan.weight || null, extraCal: 0, trainingCal: 0, notes: scan.label, trainingCalManual: false });
    } else if (!state.entries[d].weight) {
      await upsertEntry(d, Object.assign({}, state.entries[d], {
        weight: scan.weight, notes: state.entries[d].notes || scan.label
      }));
    }
    ['d_date','d_label','d_weight','d_bf','d_lean'].forEach(id => el(id).value = '');
    hooks.render();
  });

  el('cm_start_btn').addEventListener('click', startCampForm);

  el('cm_edit').addEventListener('click', () => {
    const cm = campMode();
    if (!cm.active) return;
    formMode = 'edit';
    fillForm(cm.camp);
    hooks.render();
  });

  el('cm_cancel').addEventListener('click', () => { formMode = null; showErr(''); hooks.render(); });

  el('cm_save').addEventListener('click', async () => {
    const id = el('cm_id').value;
    const camp = {
      id: id ? Number(id) : null,
      name: el('cm_name').value.trim() || 'Untitled camp',
      startDate: el('cm_start').value,
      endDate: el('cm_end').value,
      targetWeight: el('cm_target').value === '' ? null : Number(el('cm_target').value),
      archived: false
    };
    if (!camp.startDate || !camp.endDate) { showErr('A camp needs a start and an end date.'); return; }
    if (camp.endDate < camp.startDate) { showErr('The end date cannot be before the start date.'); return; }
    // Two running camps would make "the active camp" ambiguous.
    const clash = campsSorted().find(c => c.id !== camp.id && !c.archived
      && c.startDate <= camp.endDate && camp.startDate <= c.endDate);
    if (clash) { showErr(`Those dates overlap "${clash.name}" (${shortDate(clash.startDate)} → ${shortDate(clash.endDate)}). End or remove it first.`); return; }
    if (await saveCamp(camp)) { formMode = null; hooks.render(); }
    else showErr('Could not save the camp — check the sync status.');
  });

  el('cm_end_btn').addEventListener('click', () => {
    tapConfirm(el('cm_end_btn'), 'Tap again to end', async () => {
      const cm = campMode();
      if (!cm.active) return;
      const today = todayISO();
      // Ends today (or on its planned date if that is sooner) and is archived, so
      // camp mode switches off straight away.
      await saveCamp(Object.assign({}, cm.camp, {
        endDate: cm.camp.endDate < today ? cm.camp.endDate : today,
        archived: true
      }));
    });
  });

  el('cm_view_current').addEventListener('click', () => {
    const cm = campMode();
    if (cm.active) { openCampId = cm.camp.id; hooks.render(); }
  });

  const closeSheet = () => { openCampId = null; hooks.render(); };
  el('cs_close').addEventListener('click', closeSheet);
  el('cs_backdrop').addEventListener('click', closeSheet);
}

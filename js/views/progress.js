// Progress — weight & DEXA, calories, camp mode. Also the entry point for the
// daily weigh-in sheet.

import { sb, state, hooks } from '../state.js';
import { el, fmt, shortDate, todayISO } from '../util.js';
import { C } from '../config.js';
import { deleteDexa, upsertEntry, saveCamp } from '../data.js';
import {
  intakeFor, burnFor, rmrFor, sortedDates, latestWeight,
  weighedDatesBetween, baselineWeight, campMode, chartRange, campsSorted
} from '../calc.js';
import { openEntry } from './entry.js';

let weightChart, calChart;

export function resizeCharts(){
  if (weightChart) weightChart.resize();
  if (calChart) calChart.resize();
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
  el('p_scope').textContent = range.scope === 'camp' ? range.label : range.label;

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

  renderWeightChart(range);
  renderCalChart(range);
  renderDexaTable();
  renderCampPanel();
}

function renderWeightChart(range){
  const dates = weighedDatesBetween(range.from, range.to);
  const ctx = el('weightChart');
  if (weightChart) weightChart.destroy();
  if (dates.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }
  weightChart = new Chart(ctx, {
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

function renderCalChart(range){
  const dates = sortedDates().filter(d => d <= todayISO() && d >= range.from && d <= range.to);
  const last = dates.slice(-30);
  const ctx = el('calChart');
  if (calChart) calChart.destroy();
  if (last.length === 0) { ctx.getContext('2d').clearRect(0,0,ctx.width,ctx.height); return; }

  const intake = last.map(d => intakeFor(state.entries[d]));
  // Per-day snapshot, so the rest-burn band is what each day was actually
  // measured against rather than today's RMR applied backwards.
  const rest   = last.map(d => rmrFor(state.entries[d]));
  const active = last.map(d => Number(state.entries[d].trainingCal)||0);
  const net    = last.map((d,i) => (rest[i] + active[i]) - intake[i]);

  calChart = new Chart(ctx, {
    data: {
      labels: last.map(shortDate),
      datasets: [
        { type:'bar', label:'Intake', data: intake, backgroundColor:'rgba(248,244,244,0.22)', stack:'intake', order:2 },
        { type:'bar', label:'Rest', data: rest, backgroundColor:'rgba(248,244,244,0.38)', stack:'burn', order:2 },
        { type:'bar', label:'Training', data: active, backgroundColor:C.accent, stack:'burn', order:2 },
        { type:'line', label:'Net', data: net, borderColor:C.paper, backgroundColor:C.paper, yAxisID:'y1', tension:0, borderWidth:1.5, pointRadius:0, order:1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: { legend: { labels:{ color:C.muted, boxWidth:10, boxHeight:10, font:{ family:'Barlow Condensed', size:12 } } } },
      scales: {
        y:  { stacked:true, grid:{ color:C.grid }, ticks:{ color:C.muted, font:{ family:'Barlow Condensed', size:11 } }, border:{ display:false } },
        y1: { position:'right', grid:{ drawOnChartArea:false }, ticks:{ color:C.muted, font:{ family:'Barlow Condensed', size:11 } }, border:{ display:false } },
        x:  { stacked:true, grid:{ display:false }, ticks:{ color:C.muted, font:{ family:'Barlow Condensed', size:10 }, maxRotation:0, autoSkipPadding:14 }, border:{ color:C.grid } }
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
      <td class="note-cell">${s.label||''}</td>
      <td>${fmt(s.weight,1)}</td>
      <td>${fmt(s.bf,1)}%</td>
      <td>${fmt(s.lean,1)}</td>
      <td><button class="btn-x" data-ddel="${s.id}" aria-label="Delete scan">✕</button></td>
    </tr>`).join('');
  body.querySelectorAll('[data-ddel]').forEach(btn => {
    btn.addEventListener('click', () => deleteDexa(Number(btn.getAttribute('data-ddel'))));
  });
}

function renderCampPanel(){
  const cm = campMode();
  const camps = campsSorted();
  el('cm_state').textContent = cm.active
    ? `Running · day ${cm.dayIndex} of ${cm.dayCount}`
    : (camps.length ? 'No camp running' : 'No camps yet');

  const current = cm.active ? cm.camp : (camps.length ? camps[camps.length-1] : null);
  if (current) {
    el('cm_name').value = current.name || '';
    el('cm_start').value = current.startDate || '';
    el('cm_end').value = current.endDate || '';
    el('cm_target').value = current.targetWeight ?? '';
    el('cm_id').value = current.id;
    el('cm_archive').hidden = !!current.archived;
    el('cm_archive').textContent = current.archived ? 'Archived' : 'Archive this camp';
  } else {
    el('cm_id').value = '';
  }

  el('cm_list').innerHTML = camps.length
    ? camps.map(c => `
        <div class="listrow">
          <div>
            <div class="listrow-t">${c.name}</div>
            <div class="listrow-s">${shortDate(c.startDate)} → ${shortDate(c.endDate)}${c.archived ? ' · archived' : ''}</div>
          </div>
          <div class="listrow-v">${c.targetWeight ? fmt(c.targetWeight,0) : '—'}</div>
        </div>`).join('')
    : `<div class="empty-note">No camps recorded.</div>`;
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

  el('cm_save').addEventListener('click', async function(){
    const id = el('cm_id').value;
    const camp = {
      id: id ? Number(id) : null,
      name: el('cm_name').value.trim() || 'Untitled camp',
      startDate: el('cm_start').value,
      endDate: el('cm_end').value,
      targetWeight: el('cm_target').value === '' ? null : Number(el('cm_target').value),
      archived: false
    };
    if (!camp.startDate || !camp.endDate) { alert('A camp needs a start and end date.'); return; }
    if (camp.endDate < camp.startDate) { alert('The end date cannot be before the start date.'); return; }
    await saveCamp(camp);
  });

  el('cm_new').addEventListener('click', function(){
    el('cm_id').value = '';
    el('cm_name').value = '';
    el('cm_start').value = todayISO();
    el('cm_end').value = '';
    el('cm_target').value = '';
    el('cm_name').focus();
  });

  el('cm_archive').addEventListener('click', async function(){
    const id = el('cm_id').value;
    if (!id) return;
    const camp = campsSorted().find(c => c.id === Number(id));
    if (!camp) return;
    if (!confirm(`Archive "${camp.name}"?\n\nIts logs and charts become read-only. Your diary and training history stay in the main timeline.`)) return;
    await saveCamp(Object.assign({}, camp, { archived: true }));
  });
}

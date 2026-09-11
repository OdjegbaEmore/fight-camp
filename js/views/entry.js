// The daily entry sheet.
//
// The handoff has no weigh-in entry anywhere across its nineteen screens, and
// the old Log tab that held it is gone. This is that path, opened from a button
// on Progress. The ±0.5 stepper and the `Prev X · Δ ±Y` readout are carried over
// unchanged: it is the interaction already in daily use.

import { state, hooks } from '../state.js';
import { el, fmt, shortDate, todayISO } from '../util.js';
import { upsertEntry, deleteEntry } from '../data.js';
import { sortedDates, latestWeight, rmrFor, baseCalFor } from '../calc.js';
import { WEIGH_STEP } from '../config.js';

export function openEntry(date){
  state.editDate = date || todayISO();
  el('entrySheet').hidden = false;
  document.body.style.overflow = 'hidden';
  populate(state.editDate);
}

export function closeEntry(){
  el('entrySheet').hidden = true;
  document.body.style.overflow = '';
}

function populate(d){
  const e = state.entries[d];
  el('f_date').value = d;
  el('f_weight').value = (e && e.weight != null && e.weight !== '') ? Number(e.weight).toFixed(1) : '';
  el('f_extra').value = e ? (e.extraCal || 0) : '';
  el('f_notes').value = e ? (e.notes || '') : '';
  el('f_training').value = '';
  el('f_trainedit').hidden = true;
  renderTrainingState();
  renderMeta();
}

function renderTrainingState(){
  const d = el('f_date').value || todayISO();
  const e = state.entries[d];
  const stateEl = el('f_trainstate'), valEl = el('f_trainval'), srcEl = el('f_trainsrc');
  const editEl = el('f_trainedit'), unlockBtn = el('f_trainunlock'), autoBtn = el('f_trainauto');

  if (!e) {
    stateEl.innerHTML = '';
    valEl.textContent = '—';
    valEl.classList.remove('manual');
    srcEl.textContent = 'No entry yet';
    editEl.hidden = true;
    unlockBtn.hidden = true;
    autoBtn.hidden = true;
    return;
  }

  valEl.textContent = fmt(e.trainingCal);

  if (e.trainingCalManual) {
    stateEl.innerHTML = `<span class="chip manual">Manual</span>`;
    valEl.classList.add('manual');
    srcEl.textContent = 'Hand-entered · sync skips this day';
    unlockBtn.hidden = true;
    editEl.hidden = false;
    autoBtn.hidden = false;
  } else {
    stateEl.innerHTML = `<span class="chip auto">Auto · locked</span>`;
    valEl.classList.remove('manual');
    const n = state.workouts.filter(w => w.date === d).length;
    srcEl.textContent = n ? `Myzone · ${n} ${n === 1 ? 'session' : 'sessions'}` : 'Myzone · no sessions yet';
    // Stays collapsed until Override is pressed: an accidental keystroke must
    // never be able to flip a day to manual and lock it out of the sync.
    unlockBtn.hidden = !editEl.hidden;
    autoBtn.hidden = true;
  }
}

function renderMeta(){
  const d = el('f_date').value;
  el('f_datelab').textContent = d ? shortDate(d) : '—';

  const wEl = el('f_weight');
  const cur = wEl.value === '' ? null : Number(wEl.value);
  let prev = null;
  for (const pd of sortedDates()) {
    if (pd >= d) break;
    const w = state.entries[pd].weight;
    if (w !== null && w !== undefined && w !== '') prev = { date: pd, weight: Number(w) };
  }
  const prevEl = el('f_wprev');
  if (prev && cur !== null) {
    const delta = cur - prev.weight;
    prevEl.textContent = `Prev ${fmt(prev.weight,1)} · Δ ${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta),1)}`;
  } else if (prev) {
    prevEl.textContent = `Prev ${fmt(prev.weight,1)} · ${shortDate(prev.date)}`;
  } else {
    prevEl.textContent = cur !== null ? 'First weigh-in' : 'No weigh-in logged';
  }

  const extra = Number(el('f_extra').value) || 0;
  document.querySelectorAll('#f_extraquick button').forEach(b => {
    b.classList.toggle('on', Number(b.dataset.v) === extra && extra !== 0);
  });

  const e = state.entries[d];
  const training = e ? (Number(e.trainingCal) || 0) : 0;
  // Use this day's own snapshot where it has one, so the live figure matches
  // what the day will actually read once saved.
  const net = (rmrFor(e) + training) - (baseCalFor(e) + extra);
  el('f_netlab').textContent = net >= 0 ? 'Net deficit' : 'Net surplus';
  el('f_net').textContent = fmt(Math.abs(net));

  el('f_delete').hidden = !e;
}

function nudgeWeight(dir){
  const input = el('f_weight');
  const d = el('f_date').value;
  const e = state.entries[d];
  // With nothing typed, start from this day's stored weight, else the last one
  // logged — stepping up from a blank field should never begin at zero.
  if (input.value === '') {
    const lw = latestWeight();
    const base = (e && e.weight != null && e.weight !== '') ? Number(e.weight) : (lw ? lw.weight : 0);
    input.value = base.toFixed(1);
  } else {
    input.value = (Number(input.value) + dir * WEIGH_STEP).toFixed(1);
  }
  renderMeta();
}

export function wireEntry(){
  el('f_date').addEventListener('change', function(){ if (this.value) populate(this.value); });
  el('f_weight').addEventListener('input', renderMeta);
  el('f_extra').addEventListener('input', renderMeta);
  el('f_wminus').addEventListener('click', () => nudgeWeight(-1));
  el('f_wplus').addEventListener('click', () => nudgeWeight(1));
  el('entryClose').addEventListener('click', closeEntry);
  el('entryBackdrop').addEventListener('click', closeEntry);

  el('f_extraquick').addEventListener('click', function(ev){
    const btn = ev.target.closest('button[data-v]');
    if (!btn) return;
    const v = Number(btn.dataset.v);
    const input = el('f_extra');
    // Tapping the lit chip clears it, so a mis-tap is one tap to undo.
    input.value = (Number(input.value) || 0) === v ? 0 : v;
    renderMeta();
  });

  el('f_trainunlock').addEventListener('click', function(){
    el('f_trainedit').hidden = false;
    this.hidden = true;
    el('f_training').focus();
  });

  el('entryForm').addEventListener('submit', async function(ev){
    ev.preventDefault();
    const d = el('f_date').value;
    if (!d) return;
    const existing = state.entries[d] || {};
    const weightInput = el('f_weight').value;
    const extraInput = el('f_extra').value;
    const notesInput = el('f_notes').value;

    // Training calories are deliberately NOT part of this form — they belong to
    // the Myzone sync unless explicitly overridden below, which is a one-way door.
    await upsertEntry(d, {
      weight: weightInput === '' ? (existing.weight ?? null) : Number(weightInput),
      extraCal: extraInput === '' ? (existing.extraCal || 0) : Number(extraInput),
      notes: notesInput === '' ? (existing.notes || '') : notesInput,
      trainingCal: existing.trainingCal || 0,
      trainingCalManual: existing.trainingCalManual || false,
      rmrUsed: existing.rmrUsed ?? null,
      baseCalUsed: existing.baseCalUsed ?? null
    });
    populate(d);
    closeEntry();
  });

  el('f_trainsave').addEventListener('click', async function(){
    const d = el('f_date').value;
    const v = el('f_training').value;
    if (!d || v === '') return;
    const existing = state.entries[d] || { weight:null, extraCal:0, notes:'' };
    if (!confirm(`Set training burn for ${d} to ${Number(v).toLocaleString()} kcal?\n\nThis marks the day manual — the Myzone sync will stop updating it until you release it back to auto.`)) return;
    await upsertEntry(d, Object.assign({}, existing, {
      trainingCal: Number(v), trainingCalManual: true
    }));
    el('f_training').value = '';
    renderTrainingState();
  });

  el('f_trainauto').addEventListener('click', async function(){
    const d = el('f_date').value;
    const existing = state.entries[d];
    if (!d || !existing) return;
    if (!confirm(`Release ${d} back to the Myzone sync?\n\nThe current value stays until the next sync run overwrites it.`)) return;
    await upsertEntry(d, Object.assign({}, existing, { trainingCalManual: false }));
    renderTrainingState();
  });

  el('f_delete').addEventListener('click', async function(){
    const d = el('f_date').value;
    const e = state.entries[d];
    if (!d || !e) return;

    const bits = [];
    if (e.weight != null && e.weight !== '') bits.push(`weigh-in ${fmt(e.weight,1)} lb`);
    if (e.extraCal) bits.push(`${fmt(e.extraCal)} extra kcal`);
    if (e.trainingCal) bits.push(`${fmt(e.trainingCal)} training kcal`);
    if (e.notes) bits.push('notes');
    const sessions = state.workouts.filter(w => w.date === d).length;

    let msg = `Delete the entry for ${shortDate(d)}?\n\n`;
    msg += bits.length ? `This removes: ${bits.join(', ')}.` : 'This entry is empty.';
    if (sessions) {
      msg += `\n\nThe ${sessions} Myzone session${sessions === 1 ? '' : 's'} logged that day are kept, `
           + `so the next sync will rebuild the day's training total.`;
    }
    if (d === todayISO()) msg += `\n\nThis is today — a blank entry will be recreated next time the app loads.`;
    if (!confirm(msg)) return;

    await deleteEntry(d);
    populate(d);
  });
}

// Re-expose for the render cycle: the sheet's live figures must follow cloud
// changes while it is open.
export function refreshEntryIfOpen(){
  if (!el('entrySheet').hidden) { renderTrainingState(); renderMeta(); }
}

// Train — templates, builder, session runner, history, class reservations.

import { state, hooks } from '../state.js';
import { el, fmt, shortTime, shortDate, longDate, escapeAttr, todayISO } from '../util.js';
import { saveTemplate, deleteTemplate, logTemplateSession } from '../data.js';
import { upcomingReservations, pastReservations, displayClass, scheduleUrl, localNow } from '../archetype.js';
import {
  runner, startSession, pauseToggle, isPaused, skipRound, endSession,
  positionAt, expandRounds, workCount, audioState
} from '../runner.js';

let pane = 'templates';        // templates | builder | runner | history | classes
let draft = null;              // template being edited

function mmss(sec){
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec/60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function clock(sec){ return Math.floor(sec/60) + ':' + String(sec % 60).padStart(2,'0'); }

export function renderTrain(){
  // The runner owns the screen while a session is live — you are not browsing
  // templates mid-round, and leaving the tab must not abandon the session.
  if (runner.active) pane = 'runner';

  el('tr_seg').querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', b.dataset.pane === pane));

  ['templates','builder','runner','history','classes'].forEach(p =>
    el('tr_' + p).hidden = (p !== pane));

  if (pane === 'templates') renderTemplates();
  else if (pane === 'builder') renderBuilder();
  else if (pane === 'runner') renderRunner();
  else if (pane === 'classes') renderClasses();
  else renderHistory();
}

export function setPane(p){ pane = p; hooks.render(); }

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
function renderTemplates(){
  const list = state.templates || [];
  el('tr_count').textContent = list.length
    ? `${list.length} ${list.length === 1 ? 'template' : 'templates'}` : '— —';

  el('tpl_list').innerHTML = list.length
    ? list.map(t => {
        const rounds = expandRounds(t);
        const mins = Math.round(rounds.reduce((a,r) => a + r.seconds, 0) / 60);
        const n = t.rounds.filter(r => r.kind !== 'rest').length;
        return `
        <div class="listrow" data-tpl="${t.id}" role="button" tabindex="0">
          <div>
            <div class="listrow-t">${escapeAttr(t.name)}</div>
            <div class="listrow-s">${n} ${n === 1 ? 'round' : 'rounds'} · ${clock(t.workSeconds)} work / ${clock(t.restSeconds)} rest</div>
          </div>
          <div class="listrow-v">${mins}<small style="font-size:12px; color:var(--muted);"> min</small></div>
        </div>`;
      }).join('')
    : `<div class="empty-note">No templates yet. Build one and it appears here.</div>`;

  el('tpl_list').querySelectorAll('[data-tpl]').forEach(row => {
    const open = () => openTemplate(Number(row.dataset.tpl));
    row.addEventListener('click', open);
    row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
  });
}

function openTemplate(id){
  const t = (state.templates || []).find(x => x.id === id);
  if (!t) return;
  draft = JSON.parse(JSON.stringify(t));
  setPane('builder');
}

export function newTemplate(){
  draft = { id:null, name:'', subtitle:'', workSeconds:180, restSeconds:60,
            rounds:[{ name:'Round 1', seconds:180, kind:'work' }] };
  setPane('builder');
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
function renderBuilder(){
  if (!draft) { newTemplate(); return; }
  el('b_name').value = draft.name;
  el('b_work').value = draft.workSeconds;
  el('b_rest').value = draft.restSeconds;

  const total = expandRounds(draft).reduce((a,r) => a + r.seconds, 0);
  el('b_total').textContent = Math.round(total/60) + ' min';
  el('b_rounds_n').textContent = draft.rounds.filter(r => r.kind !== 'rest').length;

  el('b_list').innerHTML = draft.rounds.map((r,i) => `
    <div class="listrow round-row" data-i="${i}">
      <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
        <span class="lab" style="width:26px; flex:0 0 auto;">R${i+1}</span>
        <input class="round-name" data-i="${i}" value="${escapeAttr(r.name)}"
               placeholder="Name this round" aria-label="Round ${i+1} name">
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex:0 0 auto;">
        <input class="round-secs" type="number" inputmode="numeric" min="5" step="5"
               data-i="${i}" value="${r.seconds}" aria-label="Round ${i+1} seconds">
        <span class="listrow-s">s</span>
        <button class="btn-x" data-del="${i}" type="button" aria-label="Remove round ${i+1}">✕</button>
      </div>
    </div>`).join('');

  el('b_list').querySelectorAll('.round-name').forEach(inp => {
    inp.addEventListener('change', () => { draft.rounds[Number(inp.dataset.i)].name = inp.value; });
  });
  el('b_list').querySelectorAll('.round-secs').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = Math.max(5, Number(inp.value) || draft.workSeconds);
      draft.rounds[Number(inp.dataset.i)].seconds = v;
      renderBuilder();
    });
  });
  el('b_list').querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (draft.rounds.length === 1) return;
      draft.rounds.splice(Number(btn.dataset.del), 1);
      renderBuilder();
    });
  });

  el('b_delete').hidden = !draft.id;
}

export function wireBuilder(){
  el('b_name').addEventListener('input', () => { draft && (draft.name = el('b_name').value); });
  el('b_work').addEventListener('change', () => {
    if (!draft) return;
    draft.workSeconds = Math.max(5, Number(el('b_work').value) || 180);
    renderBuilder();
  });
  el('b_rest').addEventListener('change', () => {
    if (!draft) return;
    draft.restSeconds = Math.max(0, Number(el('b_rest').value) || 60);
    renderBuilder();
  });

  el('b_add').addEventListener('click', () => {
    if (!draft) return;
    draft.rounds.push({ name:`Round ${draft.rounds.length+1}`, seconds:draft.workSeconds, kind:'work' });
    renderBuilder();
  });

  el('b_save').addEventListener('click', async () => {
    if (!draft) return;
    if (!draft.name.trim()) { alert('Give the template a name.'); el('b_name').focus(); return; }
    draft.subtitle = `${clock(draft.workSeconds)} work / ${clock(draft.restSeconds)} rest`;
    const saved = await saveTemplate(draft);
    if (saved) { draft = null; setPane('templates'); }
  });

  el('b_discard').addEventListener('click', () => { draft = null; setPane('templates'); });

  el('b_delete').addEventListener('click', async () => {
    if (!draft || !draft.id) return;
    if (!confirm(`Remove "${draft.name}"?\n\nPast sessions that used it are kept.`)) return;
    await deleteTemplate(draft.id);
    draft = null;
    setPane('templates');
  });

  el('b_start').addEventListener('click', () => {
    if (!draft) return;
    // Must be inside this tap — the audio unlock has no second chance.
    startSession(draft);
    setPane('runner');
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function renderRunner(){
  if (!runner.active) {
    el('run_idle').hidden = false;
    el('run_live').hidden = true;
    return;
  }
  el('run_idle').hidden = true;
  el('run_live').hidden = false;
  paintRunner(positionAt(Date.now()));
}

function paintRunner(p){
  if (!runner.active) return;
  el('run_title').textContent = runner.templateName;
  el('run_round').textContent = p.done
    ? 'Complete'
    : `Round ${p.workIndex} / ${workCount()}`;

  if (p.done) return;
  // Rest rounds are named "Rest", so "Rest · Rest" is what the naive join gives.
  el('run_phase').textContent = p.round.kind === 'work'
    ? 'Work · ' + p.round.name
    : 'Rest';
  el('run_count').textContent = mmss(p.remaining);
  el('run_count').className = 'run-count' + (p.round.kind === 'rest' ? ' rest' : '');
  el('run_bar').style.width = Math.min(100, (p.elapsed / p.total) * 100) + '%';
  el('run_elapsed').textContent = mmss(p.elapsed);
  el('run_left').textContent = mmss(p.total - p.elapsed);
  el('run_pause').textContent = isPaused() ? 'Resume' : 'Pause';

  // A silent timer is the real failure mode: on a bag you are listening, not
  // looking. Say so rather than going quiet.
  const bad = !runner.wakeHeld || audioState() !== 'running';
  el('run_warn').hidden = !bad;
  if (bad) {
    el('run_warn_body').textContent = !runner.wakeHeld
      ? 'Screen lock is not held. Keep the app in front or you will not hear the round change.'
      : 'Sound is not running. Tap the screen to restore cues.';
  }

  const rest = runner.rounds.slice(p.index + 1).filter(r => r.kind === 'work');
  el('run_queue').innerHTML = rest.length
    ? rest.map((r,i) => `<div class="listrow"><div class="listrow-t">${escapeAttr(r.name)}</div><div class="listrow-s">${clock(r.seconds)}</div></div>`).join('')
    : `<div class="empty-note">Last round.</div>`;
}

export function wireRunner(){
  runner.onTick = paintRunner;
  runner.onEnd = async (summary) => {
    await logTemplateSession(summary);
    setPane('history');
  };

  el('run_pause').addEventListener('click', () => { pauseToggle(); paintRunner(positionAt(Date.now())); });
  el('run_skip').addEventListener('click', skipRound);
  el('run_end').addEventListener('click', () => {
    if (!confirm('End this session early?\n\nIt is still logged, marked incomplete.')) return;
    endSession();
  });
  // Tapping anywhere in the live runner nudges a suspended audio context back.
  el('run_live').addEventListener('click', () => { if (audioState() !== 'running') paintRunner(positionAt(Date.now())); });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
function renderHistory(){
  const ts = state.templateSessions || [];
  el('h_sessions').innerHTML = ts.length
    ? ts.slice(0,15).map(s => `
        <div class="listrow">
          <div>
            <div class="listrow-t">${escapeAttr(s.templateName)}</div>
            <div class="listrow-s">${shortDate(s.date)} · ${s.roundsDone}/${s.roundsPlanned} rounds${s.completed ? '' : ' · ended early'}</div>
          </div>
          <div class="listrow-v">${s.completed ? '✓' : '—'}</div>
        </div>`).join('')
    : `<div class="empty-note">No template sessions run yet.</div>`;

  const w = state.workouts.slice().sort((a,b) =>
    (b.date + String(b.startTime)).localeCompare(a.date + String(a.startTime))).slice(0,15);
  el('h_myzone').innerHTML = w.length
    ? w.map(x => `
        <div class="listrow">
          <div>
            <div class="listrow-t">${escapeAttr(x.name || 'Unnamed session')}</div>
            <div class="listrow-s">${shortDate(x.date)} · ${shortTime(x.startTime)} · ${fmt(x.minutes)} min</div>
          </div>
          <div class="listrow-v">${fmt(x.calories)}</div>
        </div>`).join('')
    : `<div class="empty-note">No Myzone sessions synced.</div>`;
}

// ---------------------------------------------------------------------------
// Classes — read-only, from Archetype's confirmation emails
// ---------------------------------------------------------------------------
function renderClasses(){
  const now = localNow();
  el('cl_schedule').href = scheduleUrl(now.date);

  if (state.reservations === null) {
    el('cl_count').textContent = '— —';
    el('cl_upcoming').innerHTML = `<div class="empty-note">Reservations could not be loaded.</div>`;
    el('cl_recent').innerHTML = '';
    return;
  }

  const row = (r, right) => `
    <div class="listrow">
      <div>
        <div class="listrow-t">${escapeAttr(displayClass(r.className))}</div>
        <div class="listrow-s">${longDate(r.date)} · ${shortTime(r.startTime)}${r.instructors ? ' · ' + escapeAttr(r.instructors) : ''}</div>
      </div>
      <div class="listrow-v" style="font-size:13px; color:var(--muted);">${right}</div>
    </div>`;

  const up = upcomingReservations(state.reservations, now);
  el('cl_count').textContent = up.length ? `${up.length} upcoming` : '— —';
  el('cl_upcoming').innerHTML = up.length
    ? up.map(r => row(r, r.date === now.date ? 'Today' : '')).join('')
    : `<div class="empty-note">Nothing booked. Book in the Archetype app and it shows up here after the next sync.</div>`;

  const past = pastReservations(state.reservations, now).slice(0, 20);
  el('cl_recent').innerHTML = past.length
    ? past.map(r => row(r, r.status === 'cancelled' ? 'Cancelled' : r.noShow ? 'No-show' : '')).join('')
    : `<div class="empty-note">No past classes in the last two months.</div>`;
}

export function wireTrain(){
  el('tr_seg').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-pane]');
    if (!b) return;
    if (runner.active && b.dataset.pane !== 'runner') return;  // don't strand a live session
    setPane(b.dataset.pane);
  });
  el('tpl_new').addEventListener('click', newTemplate);
  wireBuilder();
  wireRunner();
}

// Today — the dashboard. Two modes.
//
// Off-season it is a training companion. When a camp is running, the weight-cut
// telemetry (net deficit hero, weigh-in progress, metric grid) is inserted above
// the shared content. Those three NEVER render outside camp mode.

import { state } from '../state.js';
import { el, fmt, shortDate, longDate, shortTime, pad3, escapeAttr, todayISO } from '../util.js';
import { saveWorkoutName } from '../data.js';
import { upcomingReservations, displayClass, gymLink, localNow } from '../archetype.js';
import {
  campMode, intakeFor, burnFor, netFor, sortedDates,
  latestWeight, baselineWeight
} from '../calc.js';

// Rotating pull quote, one per day. Content, not a hardcoded string.
const QUOTES = [
  ['Everyone has a plan until they get punched in the mouth.', 'Mike Tyson'],
  ['Champions are made from something they have deep inside them — a desire, a dream, a vision.', 'Muhammad Ali'],
  ['I hated every minute of training, but I said: don’t quit. Suffer now and live the rest of your life as a champion.', 'Muhammad Ali'],
  ['It’s not the man who can’t be hurt. It’s the man who keeps going.', 'Jack Dempsey'],
  ['To be a great champion you must believe you are the best. If you’re not, pretend you are.', 'Muhammad Ali'],
  ['The fight is won or lost far away from witnesses.', 'Muhammad Ali'],
  ['You don’t get anything for free. You have to earn it every single day.', 'Bernard Hopkins']
];

function quoteOfDay(){
  const t = todayISO();
  const seed = Number(t.slice(0,4)) * 372 + Number(t.slice(5,7)) * 31 + Number(t.slice(8,10));
  return QUOTES[seed % QUOTES.length];
}

export function renderToday(){
  const cm = campMode();
  const t = todayISO();
  const e = state.entries[t];

  el('t_title').textContent = 'Today';
  el('t_when').textContent = longDate(t).toUpperCase() + ' · WK ' + isoWeek(t);

  // Header pill: camp day counter while running, "Start camp" otherwise.
  const pill = el('t_pill');
  if (cm.active) {
    pill.className = 'pill pill-solid';
    pill.textContent = `Camp · d${cm.dayIndex}/${cm.dayCount}`;
  } else {
    pill.className = 'pill pill-line';
    pill.textContent = 'Start camp';
  }

  el('t_camp_block').hidden = !cm.active;
  el('t_quote_block').hidden = cm.active;   // no quote in camp mode — the screen is denser

  if (cm.active) renderCampTelemetry(cm, e);
  else renderQuote();

  renderWeeklyFocus();
  renderNextSession();
  renderBreakdown();
}

function isoWeek(iso){
  const d = new Date(iso + 'T00:00:00');
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  return 1 + Math.round(diff / (7 * 86400000));
}

function renderCampTelemetry(cm, e){
  const net = e ? netFor(e) : 0;
  el('t_netlab').textContent = net >= 0 ? 'Net deficit today' : 'Net surplus today';
  el('t_net').textContent = fmt(Math.abs(net));

  const recent = sortedDates().filter(d => d <= todayISO()).slice(-7);
  const mean = recent.length
    ? recent.reduce((a,d) => a + netFor(state.entries[d]), 0) / recent.length
    : 0;
  el('t_mean').textContent = e
    ? `Intake ${fmt(intakeFor(e))} · burn ${fmt(burnFor(e))} · 7-day mean ${fmt(mean)}`
    : 'No entry logged today';

  // Weigh-in progress — against the camp's target where one is set, otherwise
  // the camp clock, which is what the app has always shown.
  const lw = latestWeight();
  const base = baselineWeight();
  const target = cm.camp.targetWeight;
  const wiTop = el('t_wi_top'), wiRight = el('t_wi_right');
  const wiLeft = el('t_wi_left'), wiOut = el('t_wi_out');

  wiTop.textContent = lw ? `Weigh-in · ${fmt(lw.weight,1)} lb` : 'Weigh-in · —';
  if (target && lw && base) {
    const span = base.weight - target;
    const done = base.weight - lw.weight;
    const pct = span > 0 ? Math.min(100, Math.max(0, (done/span)*100)) : 0;
    wiRight.textContent = `Target ${fmt(target,0)}`;
    el('t_bar').style.width = pct + '%';
    wiLeft.textContent = base ? `${done >= 0 ? '−' : '+'}${fmt(Math.abs(done),1)} since ${shortDate(base.date)}` : '';
    wiOut.textContent = `${fmt(Math.max(0, lw.weight - target),1)} to go`;
  } else {
    wiRight.textContent = `Ends ${shortDate(cm.camp.endDate)}`;
    el('t_bar').style.width = cm.pct + '%';
    wiLeft.textContent = (lw && base)
      ? `${base.weight - lw.weight >= 0 ? '−' : '+'}${fmt(Math.abs(base.weight - lw.weight),1)} since ${shortDate(base.date)}`
      : 'No baseline yet';
    wiOut.textContent = cm.daysOut + (cm.daysOut === 1 ? ' day out' : ' days out');
  }

  // 2x2 metric grid
  const lastScan = (state.dexaScans||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).pop();
  const prev = prevWeighIn(todayISO());
  const cells = [
    { lab:'Mass',
      val: lw ? `${fmt(lw.weight,1)} <small>lb</small>` : '—',
      note: (lw && prev) ? `${lw.weight - prev.weight <= 0 ? '−' : '+'}${fmt(Math.abs(lw.weight - prev.weight),1)} vs previous` : 'Log a weigh-in' },
    { lab:'Body fat',
      val: lastScan ? `${fmt(lastScan.bf,1)}<small>%</small>` : '—',
      note: lastScan ? 'DEXA ' + shortDate(lastScan.date) : 'No scan logged' },
    { lab:'Intake',
      val: e ? fmt(intakeFor(e)) : '—',
      note: e ? `${fmt(e.baseCalUsed ?? state.settings.baseCal)} plan + ${fmt(e.extraCal||0)}` : '' },
    { lab:'Burn',
      val: e ? fmt(burnFor(e)) : '—',
      note: e ? `${fmt(e.rmrUsed ?? state.settings.rmr)} rest + ${fmt(e.trainingCal||0)} training` : '' }
  ];
  el('t_grid').innerHTML = cells.map(c => `
    <div>
      <div class="lab">${c.lab}</div>
      <div class="cell-v">${c.val}</div>
      <div class="cell-n">${c.note||''}</div>
    </div>`).join('');
}

function prevWeighIn(beforeISO){
  let prev = null;
  for (const d of sortedDates()){
    if (d >= beforeISO) break;
    const w = state.entries[d].weight;
    if (w !== null && w !== undefined && w !== '') prev = { date: d, weight: Number(w) };
  }
  return prev;
}

function renderQuote(){
  const [text, who] = quoteOfDay();
  el('t_quote').textContent = '“' + text + '”';
  el('t_quote_by').textContent = who;
}

function renderWeeklyFocus(){
  // Weekly focus is content-table backed and arrives in Phase 4. Until then this
  // is an honest empty state rather than an invented focus.
  el('t_focus_eyebrow').textContent = 'Weekly focus · week ' + isoWeek(todayISO());
  el('t_focus_title').textContent = 'Not set';
  el('t_focus_body').textContent = 'Weekly focus arrives with the tips library.';
}

// The soonest booked class, from the gym's confirmation emails. Links out to the
// gym's app on a phone (its web schedule on desktop) — there is no Book button,
// booking lives in the gym's app.
function renderNextSession(){
  const now = localNow();
  const title = el('t_next_title'), meta = el('t_next_meta');
  const link = date => {
    const g = gymLink(date);
    // The shortcuts:// link must open in place; a new tab would leave a blank one behind.
    return `<a class="lab" href="${g.url}"${g.external ? ' target="_blank" rel="noopener"' : ''}
        style="display:inline-block; padding:12px 0 12px 12px; color:var(--muted); text-decoration:none;">${g.label} ↗</a>`;
  };

  if (state.reservations === null) {
    title.textContent = '— —';
    meta.textContent = 'Reservations could not be loaded.';
    el('t_next_right').innerHTML = link(now.date);
    return;
  }

  const next = upcomingReservations(state.reservations, now)[0];
  if (!next) {
    title.textContent = 'Nothing booked';
    meta.textContent = 'Book in the Archetype app and it appears here.';
    el('t_next_right').innerHTML = link(now.date);
    return;
  }

  const tomorrow = localNow(new Date(Date.now() + 86400000)).date;
  const day = next.date === now.date ? 'Today' : next.date === tomorrow ? 'Tomorrow' : longDate(next.date);
  title.textContent = displayClass(next.className);
  meta.textContent = `${day} · ${shortTime(next.startTime)}${next.instructors ? ' · ' + next.instructors : ''}`;
  el('t_next_right').innerHTML = link(next.date);
}

// Per-session breakdown, straight from Myzone. The design's category bars
// (Boxing/Bag/Strength/…) need session names, which Myzone does not supply and
// which get auto-filled from reservations in Phase 5 — so this stays per-session.
function renderBreakdown(){
  const t = todayISO();
  const list = state.workouts.filter(w => w.date === t)
                             .sort((a,b) => String(a.startTime).localeCompare(String(b.startTime)));
  const wrap = el('w_list');
  const total = el('w_total');

  if (list.length === 0) {
    total.textContent = '— —';
    const e = state.entries[t];
    wrap.innerHTML = `<div class="empty-note">${
      e && e.trainingCalManual
        ? 'This day is set to manual, so there is no per-session detail — only the override total.'
        : 'No sessions logged today. Myzone summaries arrive by email after each session.'
    }</div>`;
    return;
  }

  total.textContent = `${list.length} ${list.length === 1 ? 'session' : 'sessions'} · ${fmt(
    list.reduce((a,w) => a + (Number(w.calories)||0), 0))} kcal`;

  wrap.innerHTML = list.map(w => `
    <div class="wo">
      <input class="wo-name" data-wid="${w.id}" value="${escapeAttr(w.name)}"
             placeholder="Name this activity" aria-label="Activity name">
      <div class="wo-metrics">
        <div><div class="wo-lab">Start</div><div class="wo-v">${shortTime(w.startTime)}</div></div>
        <div><div class="wo-lab">Minutes</div><div class="wo-v">${fmt(w.minutes)}</div></div>
        <div><div class="wo-lab">Avg effort</div><div class="wo-v">${fmt(w.avgEffort)}<small>%</small></div></div>
        <div><div class="wo-lab">Calories</div><div class="wo-v">${fmt(w.calories)}</div></div>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('.wo-name').forEach(inp => {
    inp.addEventListener('blur', () => saveWorkoutName(Number(inp.dataset.wid), inp.value.trim()));
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
  });
}

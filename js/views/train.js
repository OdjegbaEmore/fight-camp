// Train — templates, builder, session runner, history, reservations, tips.
//
// Phase 1 ships the tab and its routing only. Each section states plainly what
// it is waiting on rather than showing invented data.

import { state } from '../state.js';
import { el, fmt, shortTime, shortDate } from '../util.js';

export function renderTrain(){
  const sessions = state.workouts.slice().sort((a,b) =>
    (b.date + String(b.startTime)).localeCompare(a.date + String(a.startTime))).slice(0, 12);

  el('tr_count').textContent = state.workouts.length
    ? `${state.workouts.length} synced` : '— —';

  el('tr_history').innerHTML = sessions.length
    ? sessions.map(w => `
        <div class="listrow">
          <div>
            <div class="listrow-t">${w.name || 'Unnamed session'}</div>
            <div class="listrow-s">${shortDate(w.date)} · ${shortTime(w.startTime)} · ${fmt(w.minutes)} min</div>
          </div>
          <div class="listrow-v">${fmt(w.calories)}</div>
        </div>`).join('')
    : `<div class="empty-note">No sessions synced yet.</div>`;
}

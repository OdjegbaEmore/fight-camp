// More — settings, data tools, connections.

import { sb, state, hooks } from '../state.js';
import { el, fmt } from '../util.js';
import { saveSettings, runBackfill, resetCloud } from '../data.js';
import { intakeFor, burnFor, sortedDates } from '../calc.js';

export function renderMore(){
  el('s_rmr').value = state.settings.rmr;
  el('s_base').value = state.settings.baseCal;

  // Connection states are facts about this install, not aspirations.
  const sessions = state.workouts.length;
  el('conn_myzone').textContent = sessions
    ? `Connected · ${sessions} ${sessions === 1 ? 'session' : 'sessions'}`
    : 'Not connected';
  el('conn_myzone').classList.toggle('on', sessions > 0);

  el('conn_gym').textContent = 'Not connected';
  el('conn_gym').classList.remove('on');
  el('conn_news').textContent = 'Not connected';
  el('conn_news').classList.remove('on');
}

export function wireMore(){
  el('saveSettingsBtn').addEventListener('click', async function(){
    await saveSettings({
      rmr: Number(el('s_rmr').value) || state.settings.rmr,
      baseCal: Number(el('s_base').value) || state.settings.baseCal
    });
  });

  el('exportBtn').addEventListener('click', function(){
    const dates = sortedDates();
    let csv = 'date,weight,extra_cal,training_cal,rmr_used,base_cal_used,intake,burn,net_deficit,notes\n';
    dates.forEach(d => {
      const e = state.entries[d];
      const intake = intakeFor(e), burn = burnFor(e);
      csv += [
        d, e.weight ?? '', e.extraCal||0, e.trainingCal||0,
        e.rmrUsed ?? '', e.baseCalUsed ?? '',
        intake, burn, burn-intake, (e.notes||'').replace(/,/g,';')
      ].join(',') + '\n';
    });
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fight_camp_log.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  el('backfillBtn').addEventListener('click', runBackfill);
  el('resetBtn').addEventListener('click', resetCloud);
  el('logoutBtn').addEventListener('click', () => sb.auth.signOut());
}

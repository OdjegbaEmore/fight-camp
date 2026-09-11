// Fuel — food diary, cookbook, meal plans.
//
// Phase 1 ships the tab and its routing only. The diary becomes the intake
// source in Phase 3, at which point entries.extra_cal stops being hand-typed.

import { state } from '../state.js';
import { el, fmt, todayISO } from '../util.js';
import { intakeFor } from '../calc.js';

export function renderFuel(){
  const e = state.entries[todayISO()];
  el('fu_intake').textContent = e ? fmt(intakeFor(e)) : '—';
  el('fu_base').textContent = e
    ? `/ ${fmt(e.baseCalUsed ?? state.settings.baseCal)} kcal plan`
    : '/ — kcal plan';
}

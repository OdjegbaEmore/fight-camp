// Fight Camp — bootstrap, routing, auth.

import { sb, state, hooks } from './state.js';
import { el, todayISO, setSyncStatus } from './util.js';
import { loadAll, ensureToday, setupRealtime, maybeOfferImport } from './data.js';
import { renderToday } from './views/today.js';
import { renderProgress, wireProgress, resizeCharts } from './views/progress.js';
import { renderTrain, wireTrain } from './views/train.js';
import { renderFuel } from './views/fuel.js';
import { renderMore, wireMore } from './views/more.js';
import { wireEntry, refreshEntryIfOpen, openEntry } from './views/entry.js';

let booted = false;

// ---- Routing ----
const TABS = ['today','train','fuel','progress','more'];

function currentTab(){
  const h = (location.hash || '').replace(/^#\/?/, '');
  return TABS.indexOf(h) >= 0 ? h : 'today';
}

function applyRoute(){
  const tab = currentTab();
  TABS.forEach(t => el('view-' + t).classList.toggle('on', t === tab));
  document.querySelectorAll('.tabbar a').forEach(a => {
    a.classList.toggle('on', a.getAttribute('data-tab') === tab);
  });
  window.scrollTo(0, 0);
  // Chart.js needs a resize nudge when its canvas becomes visible after having
  // been display:none at construction time.
  if (tab === 'progress') resizeCharts();
}
window.addEventListener('hashchange', applyRoute);

// ---- Render ----
function render(){
  renderToday();
  renderTrain();
  renderFuel();
  renderProgress();
  renderMore();
  refreshEntryIfOpen();
}
hooks.render = render;

// ---- Auth ----
function showLogin(){
  el('loginScreen').style.display = 'flex';
  el('appRoot').style.display = 'none';
}
function showApp(){
  el('loginScreen').style.display = 'none';
  el('appRoot').style.display = '';
  if (!booted) { booted = true; boot(); }
}

el('loginForm').addEventListener('submit', async function(ev){
  ev.preventDefault();
  const email = el('l_email').value.trim();
  const password = el('l_password').value;
  el('loginError').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) el('loginError').textContent = error.message;
});

sb.auth.onAuthStateChange((event, session) => { if (session) showApp(); else showLogin(); });

// ---- Boot ----
async function boot(){
  // If the first load fails (offline, token refresh race, RLS hiccup), stop
  // before ensureToday() writes a bogus empty entry over data we never managed
  // to read — and clear `booted` so the next auth event or reload retries
  // instead of leaving the dashboard stuck on placeholder dashes.
  const loaded = await loadAll();
  if (!loaded) { booted = false; applyRoute(); render(); return; }
  await maybeOfferImport();
  await ensureToday();
  state.editDate = todayISO();
  applyRoute();
  render();
  setupRealtime();
}

// ---- Wiring ----
wireProgress();
wireMore();
wireEntry();
wireTrain();

// The Today header pill starts a camp when none is running; while one is, it is
// a read-only day counter.
el('t_pill').addEventListener('click', function(){
  if (this.classList.contains('pill-line')) {
    location.hash = '#/progress';
    setTimeout(() => el('cm_new').click(), 60);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

sb.auth.getSession().then(({ data }) => { if (data.session) showApp(); else showLogin(); });

// More — settings, data tools, connections.

import { sb, state, hooks } from '../state.js';
import { el, fmt, escapeAttr, shortDate, longDate } from '../util.js';
import { saveSettings, runBackfill, resetCloud } from '../data.js';
import { intakeFor, burnFor, sortedDates } from '../calc.js';
import { gymShortcutOn, setGymShortcut, SHORTCUT_NAME } from '../archetype.js';
import { newsStories, NEWS_CATEGORIES, newsCategoryLabel } from '../content.js';

let moreView = 'main';     // main | news
let newsCat = '';          // '' = all
let openStoryId = null;    // story shown in the article sheet

export function renderMore(){
  el('mo_main').hidden = moreView !== 'main';
  el('mo_news').hidden = moreView !== 'news';
  el('mo_title').textContent = moreView === 'news' ? 'News' : 'More';
  el('mo_sync').hidden = moreView === 'news';
  el('nw_sources').hidden = moreView !== 'news';
  if (moreView === 'news') renderNews();
  renderArticle();

  el('s_rmr').value = state.settings.rmr;
  el('s_base').value = state.settings.baseCal;

  // Connection states are facts about this install, not aspirations.
  const sessions = state.workouts.length;
  el('conn_myzone').textContent = sessions
    ? `Connected · ${sessions} ${sessions === 1 ? 'session' : 'sessions'}`
    : 'Not connected';
  el('conn_myzone').classList.toggle('on', sessions > 0);

  // Reservations are synced from the gym's emails (Phase 5). null = failed to load.
  const classes = state.reservations;
  el('conn_gym').textContent = classes === null ? 'Unavailable'
    : classes.length ? `Connected · ${classes.length} ${classes.length === 1 ? 'class' : 'classes'}`
    : 'Not connected';
  el('conn_gym').classList.toggle('on', !!(classes && classes.length));
  // News is written each morning by the fight-camp-news task. null = table missing.
  const news = state.news;
  el('conn_news').textContent = news === null ? 'Unavailable'
    : news.length ? `Connected · ${news.length} ${news.length === 1 ? 'story' : 'stories'}`
    : 'Not connected';
  el('conn_news').classList.toggle('on', !!(news && news.length));

  // Gym app: per-device switch for opening Archetype through the iOS Shortcut.
  const on = gymShortcutOn();
  const t = el('gs_toggle');
  t.textContent = on ? 'On' : 'Off';
  t.className = 'pill ' + (on ? 'pill-solid' : 'pill-line');
  t.setAttribute('aria-pressed', String(on));
  el('gs_state').textContent = on
    ? `This device runs the “${SHORTCUT_NAME}” Shortcut`
    : 'Off on this device — Open app goes to the App Store page';
}

// ---------------------------------------------------------------------------
// News feed and article reader
// ---------------------------------------------------------------------------
function renderNews(){
  const all = state.news;
  const sources = new Set((all || []).map(n => n.source)).size;
  el('nw_sources').textContent = sources ? `${sources} ${sources === 1 ? 'source' : 'sources'}` : '— —';
  el('nw_cats').innerHTML = [['', 'All'], ...NEWS_CATEGORIES].map(([k, label]) =>
    `<button type="button" class="chip-f${k === newsCat ? ' on' : ''}" data-cat="${k}"
       aria-pressed="${k === newsCat}">${label}</button>`).join('');

  const list = all === null ? [] : newsStories(newsCat);
  if (!list.length) {
    el('nw_lead').innerHTML = '';
    el('nw_list').innerHTML = `<div class="empty-note">${
      all === null ? 'News could not be loaded.'
      : all.length ? 'No stories in this category right now.'
      : 'No stories yet. The news task gathers them each morning.'}</div>`;
    return;
  }

  const [lead, ...rest] = list;
  el('nw_lead').innerHTML = `
    <div class="card-accent story" data-story="${lead.id}" role="button" tabindex="0">
      <span class="tick-l"></span><span class="tick-r"></span>
      <div class="lab">Lead story · ${escapeAttr(newsCategoryLabel(lead.category))}</div>
      <div class="story-title">${escapeAttr(lead.title)}</div>
      <div class="story-sum">${escapeAttr(lead.summary)}</div>
      <div class="listrow-s">${escapeAttr(lead.source)} · ${shortDate(lead.publishedAt)}</div>
    </div>`;
  el('nw_list').innerHTML = rest.length
    ? rest.map(n => `
        <div class="listrow story" data-story="${n.id}" role="button" tabindex="0">
          <div style="min-width:0;">
            <div class="listrow-t">${escapeAttr(n.title)}</div>
            <div class="listrow-s">${escapeAttr(newsCategoryLabel(n.category))} · ${escapeAttr(n.source)} · ${shortDate(n.publishedAt)}</div>
          </div>
          <div class="listrow-s" aria-hidden="true">›</div>
        </div>`).join('')
    : `<div class="empty-note">That is everything for now.</div>`;
}

// The routine's own-words summary and a link out. Article text is never copied in.
function renderArticle(){
  const n = openStoryId === null ? null : (state.news || []).find(x => x.id === openStoryId);
  el('articleSheet').hidden = !n;
  if (!n) return;
  el('ar_cat').textContent = newsCategoryLabel(n.category);
  el('ar_title').textContent = n.title;
  el('ar_meta').textContent = `${n.source} · ${longDate(n.publishedAt)}`;
  el('ar_summary').textContent = n.summary;
  el('ar_why_box').hidden = !n.why;
  el('ar_why').textContent = n.why;
  el('ar_link').href = n.url;
}

function openMoreView(v){
  moreView = v;
  openStoryId = null;
  renderMore();
  window.scrollTo(0, 0);
}

export function wireMore(){
  const openNews = () => openMoreView('news');
  el('news_open').addEventListener('click', openNews);
  el('news_open').addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openNews(); } });
  el('nw_back').addEventListener('click', () => openMoreView('main'));
  // Leaving the tab and coming back lands on More, not a stale feed.
  window.addEventListener('hashchange', () => { if (moreView !== 'main') openMoreView('main'); });

  el('nw_cats').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-cat]');
    if (!b) return;
    newsCat = b.dataset.cat;
    renderNews();
  });
  const openStory = ev => {
    const s = ev.target.closest('[data-story]');
    if (!s) return;
    if (ev.type === 'keydown') { if (ev.key !== 'Enter' && ev.key !== ' ') return; ev.preventDefault(); }
    openStoryId = Number(s.dataset.story);
    renderArticle();
  };
  el('mo_news').addEventListener('click', openStory);
  el('mo_news').addEventListener('keydown', openStory);
  const closeStory = () => { openStoryId = null; renderArticle(); };
  el('ar_close').addEventListener('click', closeStory);
  el('ar_backdrop').addEventListener('click', closeStory);

  el('gs_toggle').addEventListener('click', () => {
    setGymShortcut(!gymShortcutOn());
    hooks.render();
  });

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

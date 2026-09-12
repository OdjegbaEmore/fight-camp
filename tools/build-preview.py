import pathlib, re, json

OUT = pathlib.Path('/private/tmp/claude-501/-Users-odjegbaemore-Health-Fitness-Boxing-Fight-Camp/2a719b68-29cd-43e4-955e-228da7819aa4/scratchpad')
OUT.mkdir(parents=True, exist_ok=True)

html = pathlib.Path('index.html').read_text()
flat = pathlib.Path('/tmp/fc-flat.js').read_text()

ENTRIES = json.loads(pathlib.Path('/tmp/entries.json').read_text())
WORKOUTS = json.loads(pathlib.Path('/tmp/workouts.json').read_text())

# --- strip things the preview must not carry ---
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>\n', '')
html = re.sub(r'<link rel="manifest"[\s\S]*?<link rel="icon" type="image/png" sizes="512x512" href="icon-512.png">\n', '', html)
# Keep the login screen in the DOM, hidden. app.js wires it at top level, so
# removing it throws on a null element and aborts every wire*() call after it —
# leaving the whole app rendered but inert.
html = html.replace('<div id="loginScreen" class="login-wrap">',
                    '<div id="loginScreen" class="login-wrap" style="display:none;">')
html = html.replace('<div id="appRoot" style="display:none;">', '<div id="appRoot">')
html = html.replace('<script type="module" src="js/app.js"></script>', '')
html = re.sub(r'<!DOCTYPE html>\n<html lang="en">\n<head>\n', '', html)
html = html.replace('</head>\n<body>\n', '')
html = html.replace('\n</body>\n</html>\n', '')
html = html.replace('<meta charset="UTF-8">\n', '')
html = re.sub(r'<meta name="viewport"[^>]*>\n', '', html)
html = re.sub(r'<meta name="(theme-color|apple-mobile-web-app-capable|apple-mobile-web-app-status-bar-style|apple-mobile-web-app-title|mobile-web-app-capable)"[^>]*>\n', '', html)
html = html.replace('<title>Fight Camp</title>', '<title>Fight Camp Preview</title>')

PREVIEW_CSS = """
<style>
  /* ── preview frame: presentation only, not part of the app ── */
  html { background: #131110; }
  body { background: #131110; }
  #previewBar, #phone, #previewNote {
    width: 100%; max-width: 430px; margin: 0 auto; box-sizing: border-box;
  }
  #previewBar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 16px;
    font-family: 'Barlow Condensed', system-ui, sans-serif; font-size: 12px;
    letter-spacing: 0.1em; text-transform: uppercase; color: #a5a09d;
  }
  #previewBar button {
    font-size: 12px; letter-spacing: 0.07em; padding: 5px 11px; border-radius: 99px;
    background: transparent; border: 1px solid #ef7059; color: #ef7059; cursor: pointer;
    font-family: 'Barlow Condensed', system-ui, sans-serif; text-transform: uppercase;
  }
  #phone {
    background: #262221;
    border-left: 1px solid rgba(248,244,244,0.1);
    border-right: 1px solid rgba(248,244,244,0.1);
  }
  /* The app's tab bar is fixed to the window; keep it inside the preview column. */
  .tabbar {
    left: 50%; right: auto; transform: translateX(-50%);
    width: 100%; max-width: 430px;
    border-left: 1px solid rgba(248,244,244,0.1);
    border-right: 1px solid rgba(248,244,244,0.1);
  }
  #previewNote {
    padding: 14px 16px calc(72px + 24px);
    font-family: 'Barlow', system-ui, sans-serif; font-size: 12px; line-height: 1.55; color: #6f6a67;
  }
  @media (max-width: 460px) {
    #phone, .tabbar { border-left: 0; border-right: 0; }
  }
</style>
"""

HARNESS = """
<script>
// ── Preview harness ─────────────────────────────────────────────────────────
// Stands in for Supabase so the page runs with no login and no network. Every
// write is a no-op that resolves: this is a look at the build, not a client.
const PREVIEW_SB = {
  from(){ const r = Promise.resolve({ data: [], error: null });
    const chain = new Proxy(function(){}, { get: () => (...a) => chain, apply: () => chain });
    return new Proxy({}, { get(_,k){ if (k==='then') return r.then.bind(r); return () => chain; } }); },
  channel(){ return { on(){ return this; }, subscribe(){ return this; } }; },
  auth: { signOut: async()=>{}, getSession: async()=>({data:{session:null}}), onAuthStateChange(){}, signInWithPassword: async()=>({error:null}) }
};
</script>
<script>
__FLAT__
</script>
<script>
// ── Seed with real logged data ──────────────────────────────────────────────
(function(){
  const E = __ENTRIES__, W = __WORKOUTS__;
  state.settings = { rmr: 2067, baseCal: 1500 };
  state.entries = {};
  E.forEach(([d,w,ec,tc,rmr,bc]) => {
    state.entries[d] = { weight:w, extraCal:ec, trainingCal:tc, notes:'',
                         trainingCalManual:false, rmrUsed:rmr, baseCalUsed:bc };
  });
  state.dexaScans = [
    {id:1,date:'2026-06-18',label:'Pre-Camp Baseline',weight:280,bf:30.9,lean:183.8},
    {id:2,date:'2026-08-31',label:'Post-Camp Scan',weight:255.4,bf:27.5,lean:175.9}
  ];
  state.workouts = W.map(([id,date,st,min,eff,cal,name]) => ({
    id, date, startTime:st, minutes:min, avgEffort:eff, calories:cal, name: name || ''
  }));
  state.camps = [{ id:1, name:'Summer Fight Camp 2026', startDate:'2026-07-13',
                   endDate:'2026-09-18', targetWeight:null, archived:false, results:null }];

  // Train — one real template so the builder and runner have something to show.
  state.templates = [{ id:1, name:'Mitts · 8 rounds', subtitle:'3:00 work / 1:00 rest',
    workSeconds:180, restSeconds:60, archived:false, rounds:[
      { name:'Shadow · loose',    seconds:180, kind:'work' },
      { name:'Bag · jab doubles', seconds:180, kind:'work' },
      { name:'Mitts · 1-1-2',     seconds:180, kind:'work' },
      { name:'Bag · body',        seconds:180, kind:'work' },
      { name:'Conditioning',      seconds:180, kind:'work' },
      { name:'Stretch down',      seconds:180, kind:'work' }
    ]}];
  state.templateSessions = [];
  state.foods = [];

  // Fuel — the real cookbook, and today filled from the active plan.
  state.recipes = SEED_RECIPES.map((r,i) => Object.assign({}, r, { id:i+1 }));
  const byName = new Map(state.recipes.map(r => [r.name, r.id]));
  state.plans = SEED_PLANS.map((p,i) => Object.assign({}, p, {
    id:i+1, items:p.items.map(x => Object.assign({}, x, { recipeId: byName.get(x.name) }))
  }));
  const today = todayISO();
  state.diaryDate = today;
  const activePlan = state.plans.find(p => p.active);
  state.diary = activePlan.items.map((it,i) => {
    const r = state.recipes.find(x => x.id === it.recipeId);
    return { id:i+1, date:today, meal:it.meal, recipeId:r.id, name:r.name, qty:1,
             unit:'serving', kcal:r.kcal, protein:r.protein, fat:r.fat, carb:r.carb, source:'plan' };
  });

  // The preview pins "today" to the last logged day so the screens are populated.
  if (!location.hash) location.hash = '#/today';
  applyRoute();
  render();

  // Camp-mode toggle: the two Today modes are the main thing to look at, and
  // off-season is otherwise a week away.
  const btn = document.getElementById('campToggle');
  const label = document.getElementById('campLabel');
  function sync(){
    const on = !state.camps[0].archived;
    label.textContent = on ? 'Camp mode · on' : 'Camp mode · off';
    btn.textContent = on ? 'Switch off' : 'Switch on';
  }
  btn.addEventListener('click', () => {
    state.camps[0].archived = !state.camps[0].archived;
    sync(); render();
    document.getElementById('phone').scrollTop = 0;
  });
  sync();
})();
</script>
"""

HARNESS = HARNESS.replace('__FLAT__', flat)
HARNESS = HARNESS.replace('__ENTRIES__', json.dumps(ENTRIES, separators=(',',':')))
HARNESS = HARNESS.replace('__WORKOUTS__', json.dumps(WORKOUTS, separators=(',',':')))

BAR = """
<div id="previewBar">
  <span id="campLabel">Camp mode · on</span>
  <button type="button" id="campToggle">Switch off</button>
</div>
<div id="phone">
"""
NOTE = """
</div>
<div id="previewNote">
  Static preview of Phases&nbsp;1–3, seeded with real logged data through 11 Sep 2026 and the
  cookbook transcribed from your own meal-plan documents. Nothing here writes — logging,
  committing, saving templates and camp controls are all inert, and food search is live so it
  needs a connection. Toggle camp mode above to see both Today states; off-season is otherwise
  a week away.
</div>
"""

out = PREVIEW_CSS + BAR + html.rstrip() + NOTE + HARNESS
pathlib.Path(OUT/'fight-camp-preview.html').write_text(out)
print('written', len(out), 'bytes ->', OUT/'fight-camp-preview.html')

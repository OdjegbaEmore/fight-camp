// Minimal offline cache for the Fight Camp Tracker PWA.
// Network-first (with cache fallback) for the HTML shell so code updates show up immediately;
// cache-first (stale-while-revalidate) for static assets that rarely change.
const CACHE_NAME = 'fight-camp-tracker-v11';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  // ES modules. The app is split across these with no build step, so every one
  // has to be precached or the app cannot start offline.
  './js/app.js',
  './js/config.js',
  './js/state.js',
  './js/util.js',
  './js/calc.js',
  './js/archetype.js',
  './js/tapconfirm.js',
  './js/data.js',
  './js/runner.js',
  './js/foodsearch.js',
  './js/seed-fuel.js',
  './js/views/today.js',
  './js/views/train.js',
  './js/views/planner.js',
  './js/views/fuel.js',
  './js/views/progress.js',
  './js/views/more.js',
  './js/views/entry.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  // Direction 3b typography — if the font URL in index.html changes, change it here too.
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Individually, so one unreachable CDN can't abort the whole precache.
    caches.open(CACHE_NAME).then((cache) =>
      // Our own files with cache:'reload', so the offline copy is what the server holds
      // now rather than whatever the browser's HTTP cache had — a stale HTTP cache once
      // seeded the precache with a pre-edit module. CDN entries keep the default.
      Promise.all(APP_SHELL.map((url) =>
        cache.add(url.startsWith('http') ? url : new Request(url, { cache: 'reload' })).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Never intercept Supabase (auth/API) calls — always hit the network so data stays live.
  if (event.request.url.indexOf('.supabase.co') !== -1) return;

  // The HTML shell itself: always prefer the network so code updates show up on next load.
  // Only fall back to cache if there's no connection.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // cache:'no-cache' revalidates with the server. A bare fetch() can be answered
      // from the browser's HTTP cache, which would serve stale code after a deploy
      // (GitHub Pages sends max-age=600) and made a local test run old modules.
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Our own ES modules: network-first, exactly like the HTML shell. All the app's
  // logic used to live inside index.html and therefore updated on every load. Now
  // that it is split across modules, serving them cache-first would pin the app to
  // whatever code was cached when CACHE_NAME last changed — a silent stale-code
  // bug, and the same class of failure that once served a stale pre-login shell.
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (icons, chart/supabase CDN bundles, Google Fonts): cache-first,
  // refresh in background. Stylesheet and font requests are no-cors, so they come back
  // opaque with status 0 — still cacheable and still usable by the browser for
  // <link> and @font-face, so accept those too or the typography dies offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

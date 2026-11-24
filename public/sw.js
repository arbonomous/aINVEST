const CACHE_NAME = 'ainvest-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([
          './',
          './manifest.webmanifest?v=2',
          './favicon.svg?v=2',
          './favicon-32x32.png?v=2',
          './icon-192.png?v=2',
        ]),
      )
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept cross-origin live market APIs (Hyperliquid, CBOE, RSS, TradingView)
  if (url.origin !== self.location.origin) return;

  // Hashed static assets: cache-first for instant repeat loads
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // HTML navigations & shell files: network-first so GitHub Pages deploys show immediately
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === 'navigate' || url.pathname.endsWith('.html'))) {
          const copy = res.clone();
          void caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./'))),
  );
});

const CACHE_NAME = 'ingredient-lens-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  // Never cache API or third-party data calls.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.endsWith('openfoodfacts.org')) return;

  // Network-first so deployed updates show up; fall back to cache offline.
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then(m => m || caches.match('./index.html')))
  );
});

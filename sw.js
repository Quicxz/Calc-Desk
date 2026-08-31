const CACHE = 'calc-desk-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg', './firebase-config.js', './cloud.js'];
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS).catch(() => {})));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname.endsWith('/sw.js');
  if (isPage) {
    event.respondWith(fetch(req).then((res) => {
      if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(req).then((res) => {
    if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req)));
});

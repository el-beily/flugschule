// Service Worker: App-Shell offline verfügbar, Fragenkatalog network-first.
const CACHE = 'flugschule-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/css/app.css', 'assets/js/util.js', 'assets/js/crypto.js', 'assets/js/store.js', 'assets/js/game.js', 'assets/js/quiz.js', 'assets/js/app.js', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.url.includes('/data/')) {
    // Fragenkatalog: erst Netz, sonst Cache
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
    return;
  }
  // App-Shell: Cache sofort, im Hintergrund aktualisieren
  e.respondWith(caches.match(req).then(cached => {
    const fresh = fetch(req).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});

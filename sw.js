const CACHE = 'rfa-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './spots.js',
  './api.js',
  './safety.js',
  './charts.js',
  './map.js',
  './catches.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isAPI = url.host.includes('open-meteo.com');
  const isTile = url.host.includes('tile.openstreetmap.org');

  if (isAPI || isTile) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req);
        const fetchP = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchP;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(c => c || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

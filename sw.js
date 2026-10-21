const CACHE = 'suishouji-shell-v42';
const ASSETS = ['./sheet-ui.js?v=42','./icons/tortoise.svg','./icons/cat.svg','./icons/fish.svg','./icons/turtle.svg','./icons/face.svg','./', './index.html', './style.css?v=42', './app.js?v=42', './numeric-ui.js?v=42', './scatter-ui.js?v=42', './scatter.js?v=42', './demo.js?v=42', './demo-data.js', './storage.js?v=42', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('suishouji-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (new URL(event.request.url).searchParams.has('check')) { event.respondWith(fetch(event.request)); return; }
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match('./index.html') : Response.error())));
});

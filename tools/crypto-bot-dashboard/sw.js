/* Tableau des robots crypto — service worker (6.11.2026, pont 1836 / tâche 108 : MAJ forcées, tous projets).
   skipWaiting à l'installation + clients.claim à l'activation : une nouvelle version prend la main tout de suite.
   Page admin : réseau d'abord (toujours la dernière version), repli hors-ligne sur la page. Ne touche JAMAIS aux
   réponses du domaine (/__bot, /__admin, /__sso : capitaux, session) ni aux requêtes non-GET ni aux autres origines. */
var CACHE_VERSION = 'kdmc-bot-v1.5.4';
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.add('./index.html').catch(function () {}); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/__') === 0) return;
  if (req.mode !== 'navigate') return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.status === 200) { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put('./index.html', copy); }); }
    return res;
  }).catch(function () { return caches.match('./index.html'); }));
});

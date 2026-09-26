/* Coffre d'autorisations — service worker (installable iOS/Android/desktop).
   Network-first (toujours la dernière version) + repli hors-ligne du shell.
   Ne cache JAMAIS : autre origine (Firebase/identitytoolkit — reads/writes live),
   requêtes non-GET, ni les URLs de MAJ forcée (?_v= / _force_upd_). */
var CACHE_VERSION = 'kdmc-approvals-v1.3';
var SHELL = ['./', './index.html', './manifest.json', './icon.svg', './version.txt', './vendor/pdf-lib.min.js'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; /* PUT/POST (Firebase, décisions) → réseau direct */
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; /* Firebase/identitytoolkit : jamais caché (live) */
  if (req.url.indexOf('_force_upd_') >= 0 || req.url.indexOf('?_v=') >= 0 || req.url.indexOf('&_v=') >= 0) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./index.html'); }); })
  );
});

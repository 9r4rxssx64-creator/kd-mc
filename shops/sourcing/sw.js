/* KDMC Sourcing — Service Worker (network-first, anti-cache-bloqué iOS). */
var CACHE_VERSION = 'kdmc-sourcing-v1.0.3';
var ASSETS = ['index.html', 'supplier.html', 'sourcing.js', 'suppliers.json', 'manifest.json'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(ASSETS).catch(function () {}); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  /* Laisser passer en réseau direct les vérifs de version / force-update + APIs. */
  if (url.indexOf('?_v=') >= 0 || url.indexOf('&_v=') >= 0 || url.indexOf('_force_upd_') >= 0) return;
  if (url.indexOf('firebasedatabase.app') >= 0 || url.indexOf('workers.dev') >= 0) return; // toujours live
  /* Network-first : code/données toujours frais, fallback cache hors-ligne. */
  e.respondWith(
    fetch(req).then(function (res) {
      try { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); }); } catch (x) {}
      return res;
    }).catch(function () { return caches.match(req); })
  );
});

/* KDMC APEX portail — service worker (MAJ auto + offline léger).
   Network-first sur la navigation (toujours la dernière version), cache du shell
   en repli hors-ligne. Ne cache jamais /__sso/* (auth dynamique). */
var CACHE_VERSION = 'kdmc-apex-v1.0.32';
var SHELL = ['./', './index.html', './kdmc-sso.js?v=1.0.26', './kdmc-portal.js?v=1.0.32', './manifest.json', './apps.json', './icon.svg'];

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
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.pathname.indexOf('/__sso/') >= 0) return; /* jamais cacher l'auth */
  if (req.url.indexOf('_force_upd_') >= 0 || req.url.indexOf('?_v=') >= 0 || req.url.indexOf('&_v=') >= 0) return; /* MAJ forcée : réseau direct */
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && url.origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./index.html'); }); })
  );
});

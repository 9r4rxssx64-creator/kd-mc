/* 22.10.2026 (pont D1, message 182) : une page (navigation) part avec la requête d'origine du navigateur (pré-chargement) ; refaire
   fetch(req) dans le service worker perdait le cookie du domaine → « Connexion au domaine requise » à la réouverture. Repli : fetch. */
function __kdmcNav(ev, rq, opt) { if (rq && rq.mode === 'navigate' && ev && ev.preloadResponse) return Promise.resolve(ev.preloadResponse).then(function (r) { return r || fetch(rq, opt); }, function () { return fetch(rq, opt); }); return fetch(rq, opt); }
/* KDMC Sourcing — Service Worker (network-first, anti-cache-bloqué iOS). */
var CACHE_VERSION = 'kdmc-sourcing-v1.0.4';
var ASSETS = ['index.html', 'supplier.html', 'sourcing.js', 'suppliers.json', 'manifest.json'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(ASSETS).catch(function () {}); }));
});
self.addEventListener('activate', function (e) { try { if (self.registration && self.registration.navigationPreload) e.waitUntil(self.registration.navigationPreload.enable().catch(function () {})); } catch (x) { /* pas de pré-chargement */ }
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if(new URL(e.request.url).pathname.indexOf('/__')===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  /* Laisser passer en réseau direct les vérifs de version / force-update + APIs. */
  if (url.indexOf('?_v=') >= 0 || url.indexOf('&_v=') >= 0 || url.indexOf('_force_upd_') >= 0) return;
  if (url.indexOf('firebasedatabase.app') >= 0 || url.indexOf('workers.dev') >= 0) return; // toujours live
  /* Network-first : code/données toujours frais, fallback cache hors-ligne. */
  e.respondWith(
    __kdmcNav(e, req).then(function (res) {
      try { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); }); } catch (x) {}
      return res;
    }).catch(function () { return caches.match(req); })
  );
});

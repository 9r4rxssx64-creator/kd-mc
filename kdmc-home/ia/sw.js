/* 22.10.2026 (pont D1, message 182) : une page (navigation) part avec la requête d'origine du navigateur (pré-chargement) ; refaire
   fetch(req) dans le service worker perdait le cookie du domaine → « Connexion au domaine requise » à la réouverture. Repli : fetch. */
function __kdmcNav(ev, rq, opt) { if (rq && rq.mode === 'navigate' && ev && ev.preloadResponse) return Promise.resolve(ev.preloadResponse).then(function (r) { return r || fetch(rq, opt); }, function () { return fetch(rq, opt); }); return fetch(rq, opt); }
/* 6.11 (tâche 108, Kevin : « MAJ forcées tôt ») : service worker de l'hôte « kdmc-ia » — skipWaiting + clients.claim (la nouvelle version prend la main tout de suite).
   Copie du modèle du coffre d'autorisations (tools/approvals/sw.js).*/
/* Modèle : service worker du coffre d'autorisations (installable iOS/Android/desktop).
   Network-first (toujours la dernière version) + repli hors-ligne du shell.
   Ne cache JAMAIS : autre origine (Firebase/identitytoolkit — reads/writes live),
   requêtes non-GET, ni les URLs de MAJ forcée (?_v= / _force_upd_). */
var CACHE_VERSION = 'kdmc-kdmc-ia-v1.0.4';
var SHELL = ['./', './index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});
self.addEventListener('activate', function (e) { try { if (self.registration && self.registration.navigationPreload) e.waitUntil(self.registration.navigationPreload.enable().catch(function () {})); } catch (x) { /* pas de pré-chargement */ }
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if(new URL(e.request.url).pathname.indexOf('/__')===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
  var req = e.request;
  if (req.method !== 'GET') return; /* PUT/POST (Firebase, décisions) → réseau direct */
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; /* Firebase/identitytoolkit : jamais caché (live) */
  if (req.url.indexOf('_force_upd_') >= 0 || req.url.indexOf('?_v=') >= 0 || req.url.indexOf('&_v=') >= 0) return;
  e.respondWith(
    __kdmcNav(e, req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./index.html'); }); })
  );
});

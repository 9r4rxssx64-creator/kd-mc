/* KDMC APEX portail — service worker (MAJ auto + offline léger).
   Network-first sur la navigation (toujours la dernière version), cache du shell
   en repli hors-ligne. Ne cache jamais /__sso/* (auth dynamique).
   13.10 : (1) './apps.json' RETIRÉ du préchargement — il répond 401 sans compte, et un seul fichier refusé faisait rejeter tout `addAll`
   (erreur avalée) : aucune coque hors ligne n'était gardée. (2) Une navigation avec une copie en cache n'attend plus le réseau plus de 4 s :
   réseau faible = la copie s'affiche, la page neuve se range en cache pour la fois suivante. */
var CACHE_VERSION = 'kdmc-apex-v1.0.85';
var SHELL = ['./', './index.html', './kdmc-sso.js?v=1.0.85', './kdmc-boite.js?v=1.0.85', './kdmc-portal.js?v=1.0.85', './manifest.json', './icon.svg'];
var COURSE_MS = 4000;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () {
    /* Pré-chargement de navigation (pont 22.10) : la requête de la page part du navigateur avec le cookie du domaine ; fetch(req) dans le SW pouvait le perdre */
    return self.registration && self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(function () {}) : null;
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.pathname.indexOf('/__') === 0 || url.pathname.indexOf('/__sso/') >= 0) return; /* SW-IDENTITE : /__sso, /__demande… = réponses du domaine, jamais en cache */
  if (req.url.indexOf('_force_upd_') >= 0 || req.url.indexOf('?_v=') >= 0 || req.url.indexOf('&_v=') >= 0) return; /* MAJ forcée : réseau direct */
  var reseau = function () {
    return (req.mode === 'navigate' && e.preloadResponse ? e.preloadResponse.then(function (r) { return r || fetch(req); }, function () { return fetch(req); }) : fetch(req)).then(function (res) {
      if (res && res.status === 200 && url.origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  };
  if (req.mode === 'navigate') {
    /* course réseau / copie : le réseau gagne s'il répond dans les 4 s ; sinon (ou s'il échoue) la copie, si on en a une */
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (m) { return m || caches.match('./index.html'); }).then(function (copie) {
      var r = reseau();
      if (!copie) return r;
      try { e.waitUntil(r.catch(function () {})); } catch (x) { /* */ }   /* la page neuve finit de se ranger en cache même si la copie a déjà répondu */
      var rien = new Promise(function (ok) { setTimeout(function () { ok(copie); }, COURSE_MS); });
      return Promise.race([r.catch(function () { return copie; }), rien]);
    }));
    return;
  }
  e.respondWith(
    reseau().catch(function () { return caches.match(req).then(function (m) { return m || caches.match('./index.html'); }); })
  );
});

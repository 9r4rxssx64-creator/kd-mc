/* 22.10.2026 (pont D1, message 182) : une page (navigation) part avec la requête d'origine du navigateur (pré-chargement) ; refaire
   fetch(req) dans le service worker perdait le cookie du domaine → « Connexion au domaine requise » à la réouverture. Repli : fetch. */
function __kdmcNav(ev, rq, opt) { if (rq && rq.mode === 'navigate' && ev && ev.preloadResponse) return Promise.resolve(ev.preloadResponse).then(function (r) { return r || fetch(rq, opt); }, function () { return fetch(rq, opt); }); return fetch(rq, opt); }
/* Créa Studio — Service Worker (offline-first) */
var CACHE_VERSION = 'crea-studio-v9.22.7';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './avatar-core.js',
  './avatar-rendu.js',
  './avatar-persos.js',
  './avatar-studio.js'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) {
    return c.addAll(ASSETS).catch(function(){ /* tolère un asset manquant */ });
  }));
});

self.addEventListener('activate', function (e) { try { if (self.registration && self.registration.navigationPreload) e.waitUntil(self.registration.navigationPreload.enable().catch(function () {})); } catch (x) { /* pas de pré-chargement */ }
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k !== CACHE_VERSION && k.indexOf('crea-studio-mediapipe') !== 0) return caches.delete(k);   /* le suivi de visage (13 Mo) survit aux mises à jour */
    }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if(new URL(e.request.url).pathname.indexOf('/__')===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  /* laisser passer les vérifs de version en réseau direct */
  if (url.indexOf('?_v=') >= 0 || url.indexOf('&_v=') >= 0) return;
  /* le suivi de visage MediaPipe (module, WASM, modèle : ~13 Mo) : téléchargé UNE fois, puis servi hors ligne */
  if (/^https:\/\/(cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@|storage\.googleapis\.com\/mediapipe-models\/)/.test(url)) {
    e.respondWith(caches.open('crea-studio-mediapipe-v1').then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res && res.ok) { try { c.put(req, res.clone()); } catch (x) { /* quota */ } } return res; });
      });
    }));
    return;
  }
  /* stale-while-revalidate pour les assets de l'app */
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = __kdmcNav(e, req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});

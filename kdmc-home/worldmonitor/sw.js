/* 22.10.2026 (pont D1, message 182) : une page (navigation) part avec la requête d'origine du navigateur (pré-chargement) ; refaire
   fetch(req) dans le service worker perdait le cookie du domaine → « Connexion au domaine requise » à la réouverture. Repli : fetch. */
function __kdmcNav(ev, rq, opt) { if (rq && rq.mode === 'navigate' && ev && ev.preloadResponse) return Promise.resolve(ev.preloadResponse).then(function (r) { return r || fetch(rq, opt); }, function () { return fetch(rq, opt); }); return fetch(rq, opt); }
/* World Monitor — Service Worker minimal (PWA installable).
   Réseau d'abord (page 100% live), cache = repli hors-ligne du shell uniquement.
   Règle CLAUDE.md #39/#52 : JAMAIS intercepter ?_v= / _force_upd_ (version-check
   du badge partagé) ; le cross-origin (APIs live, tuiles) n'est PAS intercepté. */
var CACHE_VERSION = "wm-v2.44";
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { try { if (self.registration && self.registration.navigationPreload) e.waitUntil(self.registration.navigationPreload.enable().catch(function () {})); } catch (x) { /* pas de pré-chargement */ }
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("wm-") === 0 && k !== CACHE_VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if(new URL(e.request.url).pathname.indexOf("/__")===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
  var req = e.request;
  if (req.method !== "GET") return;
  var url = req.url;
  if (url.indexOf("?_v=") >= 0 || url.indexOf("&_v=") >= 0 || url.indexOf("_force_upd_") >= 0) return; /* version-check direct réseau */
  if (url.indexOf(self.location.origin) !== 0) return; /* cross-origin : pas d'interception (données live) */
  e.respondWith(
    __kdmcNav(e, req).then(function (r) {
      if (r && r.ok && (req.mode === "navigate" || /\.(png|json|js)$/.test(new URL(url).pathname))) {
        var cp = r.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, cp); });
      }
      return r;
    }).catch(function () { return caches.match(req, { ignoreSearch: req.mode === "navigate" }); })
  );
});

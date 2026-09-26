/* World Monitor — Service Worker minimal (PWA installable).
   Réseau d'abord (page 100% live), cache = repli hors-ligne du shell uniquement.
   Règle CLAUDE.md #39/#52 : JAMAIS intercepter ?_v= / _force_upd_ (version-check
   du badge partagé) ; le cross-origin (APIs live, tuiles) n'est PAS intercepté. */
var CACHE_VERSION = "wm-v2.42";
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("wm-") === 0 && k !== CACHE_VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = req.url;
  if (url.indexOf("?_v=") >= 0 || url.indexOf("&_v=") >= 0 || url.indexOf("_force_upd_") >= 0) return; /* version-check direct réseau */
  if (url.indexOf(self.location.origin) !== 0) return; /* cross-origin : pas d'interception (données live) */
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok && (req.mode === "navigate" || /\.(png|json|js)$/.test(new URL(url).pathname))) {
        var cp = r.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, cp); });
      }
      return r;
    }).catch(function () { return caches.match(req, { ignoreSearch: req.mode === "navigate" }); })
  );
});

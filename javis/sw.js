/* Javis — Service Worker : réseau d'abord (toujours à jour), repli cache hors-ligne.
 * Même pattern qu'arbre/sw.js (éprouvé) + règle MAJ AUTO FORCÉE (CLAUDE.md) :
 * les URLs marquées ?_v= / ?_force_upd_ passent TOUJOURS en direct réseau. */
var CACHE = "javis-v1.3";
var ASSETS = ["./", "index.html", "manifest.json", "icon-512.png", "javis-widget.js"];
self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS).catch(function () {}); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k !== CACHE ? caches.delete(k) : null; }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* ne touche pas apis.kd-mc.com / open-meteo / __sso */
  if (url.search.indexOf("_v=") >= 0 || url.search.indexOf("_upd=") >= 0) return; /* MAJ auto : réseau direct */
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match("index.html"); }); })
  );
});

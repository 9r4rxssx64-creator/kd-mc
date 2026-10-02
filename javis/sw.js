/* Javis — Service Worker : réseau d'abord (toujours à jour), repli cache hors-ligne.
 * Même pattern qu'arbre/sw.js (éprouvé) + règle MAJ AUTO FORCÉE (CLAUDE.md) :
 * les URLs marquées ?_v= / ?_force_upd_ passent TOUJOURS en direct réseau. */
var CACHE = "javis-v1.15";   /* DOIT suivre JAVIS_VER du widget (garde test:javis-bee) */
var ASSETS = ["./", "manifest.json", "icon-192.png", "javis-widget.js"]; /* « ./ » EST la page : « index.html » en plus la gardait en double (audit complet 30.09) */ /* icon-512 (370 Ko) : plus pré-chargée (audit perf 27.09), le manifeste la donne à l'installation */
self.addEventListener("install", function (e) {
  self.skipWaiting();
  /* un par un : un seul fichier en échec ne vide plus tout le cache hors ligne (addAll = tout ou rien) */
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(ASSETS.map(function (a) { return c.add(a).catch(function () {}); })); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k !== CACHE ? caches.delete(k) : null; }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if(new URL(e.request.url).pathname.indexOf("/__")===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* ne touche pas apis.kd-mc.com / open-meteo / __sso */
  if (url.search.indexOf("_v=") >= 0 || url.search.indexOf("_upd=") >= 0) return; /* MAJ auto : réseau direct */
  /* Hors ligne OU domaine en panne (429 quota, 5xx) : la copie gardée plutôt qu'un écran d'erreur brut
     (audit complet 30.09, mesuré : l'app installée affichait « Error 1027 » quand le quota était atteint). */
  var copie = function () { return caches.match(req).then(function (m) { return m || (req.mode === "navigate" ? caches.match("./") : undefined); }); };
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); return r; }
      if (r && (r.status === 429 || r.status >= 500)) return copie().then(function (m) { return m || r; });
      return r;
    }).catch(function () { return copie().then(function (m) { return m || Response.error(); }); })
  );
});

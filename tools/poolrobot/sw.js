/* 22.10.2026 (pont D1, message 182) : une page (navigation) part avec la requête d'origine du navigateur (pré-chargement) ; refaire
   fetch(req) dans le service worker perdait le cookie du domaine → « Connexion au domaine requise » à la réouverture. Repli : fetch. */
function __kdmcNav(ev, rq, opt) { if (rq && rq.mode === 'navigate' && ev && ev.preloadResponse) return Promise.resolve(ev.preloadResponse).then(function (r) { return r || fetch(rq, opt); }, function () { return fetch(rq, opt); }); return fetch(rq, opt); }
/* PoolPilot SW — network-first, offline fallback. Skip version-check URLs. */
var CACHE="poolpilot-v0.11.15";
var ASSETS=["./","./index.html","./manifest.json","./icon.svg","./icon-180.png","./icon-512.png"];
self.addEventListener("install",function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){})}));
});
self.addEventListener("activate",function(e){ try { if (self.registration && self.registration.navigationPreload) e.waitUntil(self.registration.navigationPreload.enable().catch(function () {})); } catch (x) { /* pas de pré-chargement */ }
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){if(k!==CACHE)return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener("fetch",function(e){
  if(new URL(e.request.url).pathname.indexOf("/__")===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
  var req=e.request;if(req.method!=="GET")return;
  var url=req.url;
  /* laisser passer les URL de vérif version (force update) */
  if(url.indexOf("?_v=")>=0||url.indexOf("&_v=")>=0||url.indexOf("_force_upd_")>=0)return;
  e.respondWith(
    __kdmcNav(e, req).then(function(r){
      if(r&&r.status===200&&url.indexOf("http")===0){var cp=r.clone();caches.open(CACHE).then(function(c){c.put(req,cp).catch(function(){})})}
      return r;
    }).catch(function(){return caches.match(req).then(function(m){return m||caches.match("./index.html")})})
  );
});

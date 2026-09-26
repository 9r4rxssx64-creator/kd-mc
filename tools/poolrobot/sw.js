/* PoolPilot SW — network-first, offline fallback. Skip version-check URLs. */
var CACHE="poolpilot-v0.11.15";
var ASSETS=["./","./index.html","./manifest.json","./icon.svg","./icon-180.png","./icon-512.png"];
self.addEventListener("install",function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){})}));
});
self.addEventListener("activate",function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){if(k!==CACHE)return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener("fetch",function(e){
  var req=e.request;if(req.method!=="GET")return;
  var url=req.url;
  /* laisser passer les URL de vérif version (force update) */
  if(url.indexOf("?_v=")>=0||url.indexOf("&_v=")>=0||url.indexOf("_force_upd_")>=0)return;
  e.respondWith(
    fetch(req).then(function(r){
      if(r&&r.status===200&&url.indexOf("http")===0){var cp=r.clone();caches.open(CACHE).then(function(c){c.put(req,cp).catch(function(){})})}
      return r;
    }).catch(function(){return caches.match(req).then(function(m){return m||caches.match("./index.html")})})
  );
});

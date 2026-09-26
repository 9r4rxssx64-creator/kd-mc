/* KDMC Lingua — Service Worker.
   Stratégie « réseau d'abord » : on sert TOUJOURS la dernière version quand on est
   en ligne (plus jamais bloqué sur une ancienne page « collée » en mémoire), et on
   garde une copie en cache pour marcher hors-ligne. Aligné sur la règle « MAJ auto
   forcée toujours » : une nouvelle version publiée s'affiche dès la prochaine ouverture. */
var CACHE = "lingua-v2.125.1";
var ASSETS = ["./","./index.html","./app.js","./data.js","./histoires-langues.js","./mc-voix.js","./sources-langues.js","./data-mc.js","./data-lsf.js","./manifest.webmanifest","./icon.svg","./bee/wave.webp","./bee/party.webp","./bee/read.webp","./bee/point.webp","./bee/rig/base.webp","./bee/rig/wing-l.webp","./bee/rig/wing-r.webp","./donkey/wave.webp","./donkey/party.webp","./donkey/read.webp","./donkey/point.webp","./donkey/rig/base.webp"];

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS).catch(function(){}); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("fetch", function(e){
  var req=e.request;
  if(req.method!=="GET") return;
  if(req.url.indexOf("http")!==0) return;               // laisse passer les schémas non-http
  if(req.url.indexOf("/__lingua/")>=0) return;          // API cloud (voix/mémoire) : jamais mise en cache
  /* Les vidéos des signes viennent de Wikimedia. On ne les touche PAS :
     · une vidéo se charge par morceaux (requête « range ») ; passer par ici renvoie le
       fichier entier et Safari refuse alors de la lire — la vidéo resterait noire sur iPhone ;
     · et 545 vidéos n'ont rien à faire dans le cache de l'app.
     Le navigateur les gère très bien tout seul. */
  if(req.headers.get("range")) return;
  try{ if(new URL(req.url).origin!==self.location.origin) return; }catch(_){ return; }
  // RÉSEAU D'ABORD : dernière version en ligne, cache en repli hors-ligne.
  e.respondWith(
    fetch(req).then(function(r){
      if(r && r.status===200 && r.type==="basic"){ var cp=r.clone(); caches.open(CACHE).then(function(c){ c.put(req,cp); }); }
      return r;
    }).catch(function(){ return caches.match(req); })
  );
});

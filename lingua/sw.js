/* KDMC Lingua — Service Worker.
   Stratégie « réseau d'abord » : on sert TOUJOURS la dernière version quand on est
   en ligne (plus jamais bloqué sur une ancienne page « collée » en mémoire), et on
   garde une copie en cache pour marcher hors-ligne. Aligné sur la règle « MAJ auto
   forcée toujours » : une nouvelle version publiée s'affiche dès la prochaine ouverture. */
var CACHE = "lingua-v2.132.0";
var ASSETS = ["./","./index.html","./app.js","./data.js","./histoires-langues.js","./mc-voix.js","./sources-langues.js","./data-mc.js","./data-lsf.js","./translit.js","./manifest.webmanifest","./icon.svg","./bee/wave.webp","./bee/party.webp","./bee/read.webp","./bee/point.webp","./bee/rig/base.webp","./bee/rig/wing-l.webp","./bee/rig/wing-r.webp","./donkey/wave.webp","./donkey/party.webp","./donkey/read.webp","./donkey/point.webp","./donkey/rig/base.webp"];

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
  if(new URL(e.request.url).pathname.indexOf("/__")===0)return; /* SW-IDENTITE : /__sso (qui es-tu ?), /__demande… = réponses du domaine, jamais en cache (sinon identité périmée) */
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
  /* Les sondes de mise à jour (app.js?_v=…) et les rechargements forcés (?_upd=…) portent
     un numéro unique à chaque fois : les mettre en cache ferait grossir celui-ci d'une
     entrée par minute, pour rien. On laisse le réseau répondre, sans copie. */
  if(/[?&]_(v|upd)=/.test(req.url)) return;
  /* CONTENU VERSIONNÉ → DEPUIS LE TÉLÉPHONE (2.10, gratuit par défaut). Les gros fichiers de contenu
     (data.js 813 Ko, LSF, histoires…) étaient retéléchargés par le domaine à CHAQUE ouverture : ~1,5 Mo
     et autant de requêtes sur le quota gratuit. index.html (toujours frais, réseau d'abord) les appelle
     avec ?v=<version> : une nouvelle version = une nouvelle adresse = téléchargée une fois ; une ancienne
     copie ne peut jamais se mélanger à une app plus récente. Images : idem (elles changent rarement, et
     le changement de nom de cache à chaque version les renouvelle). */
  var pth=new URL(req.url).pathname;
  if(/[?&]v=/.test(req.url) || /\.(webp|png|svg)$/.test(pth)){
    e.respondWith(caches.match(req).then(function(hit){ return hit || fetch(req).then(function(r){
      if(r && r.status===200 && r.type==="basic"){ var cp=r.clone(); caches.open(CACHE).then(function(c){ c.put(req,cp); }); }
      return r; }).catch(function(){ return caches.match(req,{ignoreSearch:true}); }); }));
    return; }
  // RÉSEAU D'ABORD (index.html, app.js) : dernière version en ligne, cache en repli hors-ligne.
  e.respondWith(
    fetch(req).then(function(r){
      if(r && r.status===200 && r.type==="basic"){ var cp=r.clone(); caches.open(CACHE).then(function(c){ c.put(req,cp); }); }
      return r;
    }).catch(function(){ return caches.match(req); })
  );
});

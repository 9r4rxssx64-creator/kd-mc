/* KDMC Lingua — Service Worker.
   Stratégie « réseau d'abord » : on sert TOUJOURS la dernière version quand on est
   en ligne (plus jamais bloqué sur une ancienne page « collée » en mémoire), et on
   garde une copie en cache pour marcher hors-ligne. Aligné sur la règle « MAJ auto
   forcée toujours » : une nouvelle version publiée s'affiche dès la prochaine ouverture. */
var CACHE = "lingua-v2.142.1";
/* IMAGES : un cache À PART, au nom STABLE (13.10). Avant, les 12 images webp (1,9 Mo) étaient préchargées dans « lingua-<version> » : chaque
   nouvelle version rejetait le cache entier et retéléchargeait 1,9 Mo d'images qui n'avaient pas changé. Maintenant elles restent d'une version
   à l'autre. Une image qui CHANGE vraiment : la renommer (ou changer le nom ci-dessous) — l'ancien cache d'images est alors purgé. */
var IMG = "lingua-img";
var ASSETS = ["./","./index.html","./app.js","./data.js","./histoires-langues.js","./mc-voix.js","./sources-langues.js","./data-mc.js","./data-lsf.js","./translit.js","./manifest.webmanifest","./icon.svg"];
var IMAGES = ["./bee/wave.webp","./bee/party.webp","./bee/read.webp","./bee/point.webp","./bee/rig/base.webp","./bee/rig/wing-l.webp","./bee/rig/wing-r.webp","./donkey/wave.webp","./donkey/party.webp","./donkey/read.webp","./donkey/point.webp","./donkey/rig/base.webp"];
/* « lie-fi » : réseau d'abord, mais si le réseau ne répond pas en 4 s ET qu'une copie existe, on la sert (le réseau continue et la met à jour). */
var DELAI_RESEAU_MS = 4000;

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS).catch(function(){}); }),
    /* images : seulement celles qu'on n'a pas déjà (le cache d'images survit aux versions) */
    caches.open(IMG).then(function(c){ return Promise.all(IMAGES.map(function(u){ return c.match(u).then(function(hit){ return hit || c.add(u); }).catch(function(){}); })); })
  ]));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ if(k!==CACHE && k!==IMG) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
/* copie gardée : exacte d'abord ; pour une navigation (hors ligne, adresse avec ?… ), sans la partie ?… */
function copie(req){
  return caches.match(req).then(function(m){
    if(m || req.mode!=="navigate") return m;
    return caches.match(req,{ignoreSearch:true}).then(function(n){ return n || caches.match("./index.html",{ignoreSearch:true}); });
  });
}
function reseauPuisCopie(req){
  return new Promise(function(ok){
    var fait=false;
    function fin(r){ if(!fait){ fait=true; ok(r); } }
    var t=setTimeout(function(){ copie(req).then(function(m){ if(m) fin(m); }).catch(function(){}); }, DELAI_RESEAU_MS);
    fetch(req).then(function(r){
      clearTimeout(t);
      if(r && r.status===200 && r.type==="basic"){ var cp=r.clone(); caches.open(CACHE).then(function(c){ c.put(req,cp); }); }
      fin(r);
    }, function(){
      clearTimeout(t);
      copie(req).then(function(m){ fin(m||Response.error()); }, function(){ fin(Response.error()); });
    });
  });
}
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
     copie ne peut jamais se mélanger à une app plus récente. Images : idem, dans un cache à NOM STABLE (lingua-img, 13.10) : elles changent rarement et ne sont plus retéléchargées à chaque version
     (une image qui change vraiment : la renommer). */
  var pth=new URL(req.url).pathname;
  if(/[?&]v=/.test(req.url) || /\.(webp|png|svg)$/.test(pth)){
    var dest = /\.(webp|png|svg)$/.test(pth) ? IMG : CACHE;   /* images : cache stable, jamais rejeté à chaque version */
    e.respondWith(caches.match(req).then(function(hit){ return hit || fetch(req).then(function(r){
      if(r && r.status===200 && r.type==="basic"){ var cp=r.clone(); caches.open(dest).then(function(c){ c.put(req,cp); }); }
      return r; }).catch(function(){ return caches.match(req,{ignoreSearch:true}); }); }));
    return; }
  /* RÉSEAU D'ABORD (index.html seulement depuis v2.140.0) : dernière version en ligne, cache en repli hors-ligne.
     app.js est appelé avec ?v=<version> depuis le 10.10 (Kevin : « on attend bcp trop ») : avant, ses 370 Ko repartaient
     au domaine à CHAQUE ouverture (porte + hébergeur, ~0,65 s) ; maintenant il sort du téléphone, et une nouvelle version
     = une nouvelle adresse (index.html, toujours frais, la donne). Garde : test:lingua-maj (point 9). */
  e.respondWith(reseauPuisCopie(req));
});

/* 📞 BEE T'APPELLE, MÊME APP FERMÉE (3.10.2026, Kevin : « Intègre ») : le domaine envoie la notification à
   l'heure choisie (routeur /__lingua/appel-*, horloge Durable Object) ; on l'affiche comme un appel
   (reste à l'écran, vibre), et un toucher ouvre Lingua sur l'écran qui sonne (#appel). */
self.addEventListener("push", function(e){
  var d={}; try{ d=e.data?e.data.json():{}; }catch(_){ d={}; }
  e.waitUntil(self.registration.showNotification(d.title||"📞 Bee t'appelle", {
    body:d.body||"Ta petite leçon au téléphone — touche pour décrocher", tag:d.tag||"lingua-appel", renotify:true,
    requireInteraction:true, icon:"./icon.svg", badge:"./icon.svg", vibrate:[400,200,400,200,400],
    data:{url:d.url||"./#appel"} }));
});
self.addEventListener("notificationclick", function(e){
  e.notification.close(); var url=(e.notification.data&&e.notification.data.url)||"./#appel";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(function(cs){
    for(var i=0;i<cs.length;i++){ var c=cs[i]; if(c.url.indexOf(self.location.origin)===0&&c.focus){
      /* app déjà ouverte : on la ramène et on change juste le « # » → l'app fait sonner (hashchange) */
      return c.focus().then(function(w){ w=w||c; return w.navigate?w.navigate(url):null; }).catch(function(){ return self.clients.openWindow(url); }); } }
    return self.clients.openWindow(url);
  }));
});


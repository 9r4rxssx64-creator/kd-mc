/* KDMC Shops — Service Worker Chez Lolo. MAJ auto forcée : network-first pour les
   pages (toujours la dernière version en ligne), cache-first pour les assets, fallback offline. */
var CACHE='kdmc-chez-lolo-v2.0.15';
var PRE=['./','studio.html','bibliotheque.html','/CMCteams/shops/legal/cgv.html'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(PRE).catch(function(){})}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE&&(k.indexOf('kdmc-chez-lolo-')===0||k==='kdmc-v1')}).map(function(k){return caches.delete(k)}))}));self.clients.claim()});
self.addEventListener('message',function(e){if(e.data==='skipWaiting')self.skipWaiting()});
/* 🔔 Notifications push (alertes commande) */
self.addEventListener('push',function(e){
  var d={title:'Chez Lolo',body:'Nouvelle activité',url:'./index.html'};
  try{if(e.data)d=Object.assign(d,e.data.json());}catch(_){try{d.body=e.data.text();}catch(__){}}
  /* 1-tap = valider/payer dans Printify (d.url) ; « ✅ Valider & produire » = /validate ;
     « 🏪 Boutique » = admin (d.admin_url) ; photo produit = d.image */
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'img/og.png',badge:'img/og.png',image:d.image||undefined,tag:d.tag||'ld',data:{url:d.url||'./index.html',admin_url:d.admin_url||'./index.html',validate_url:d.validate_url||'',printify_order_id:d.printify_order_id||''},actions:Array.isArray(d.actions)?d.actions:[],vibrate:[80,40,80],requireInteraction:true}));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var dd=e.notification.data||{};
  if(e.action==='validate'&&dd.validate_url&&dd.printify_order_id){
    e.waitUntil(fetch(dd.validate_url,{method:'POST',headers:{'Content-Type':'application/json','x-ld-app':'ld-order-v1'},body:JSON.stringify({order_id:dd.printify_order_id})})
      .then(function(r){return r.json().catch(function(){return{ok:r.ok}});})
      .then(function(j){return self.registration.showNotification(j&&j.ok?'✅ Commande validée':'❌ Échec validation',{body:j&&j.ok?'Envoyée en production Printify.':((j&&j.detail)||'Réessaie depuis Printify.'),icon:'img/og.png',tag:'ld-validate'});})
      .catch(function(){return self.registration.showNotification('❌ Échec validation',{body:'Réseau indisponible — valide depuis Printify.',icon:'img/og.png',tag:'ld-validate'});}));
    return;
  }
  var u=(e.action==='admin'&&dd.admin_url)?dd.admin_url:(dd.url||'./index.html');
  e.waitUntil(self.clients.openWindow?self.clients.openWindow(u):Promise.resolve());
});
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET')return;
  if(req.url.indexOf('_force_upd_')>=0||req.url.indexOf('?_v=')>=0||req.url.indexOf('&_v=')>=0)return; /* MAJ forcée : laisser passer en réseau direct */
  var isNav=req.mode==='navigate'||(req.headers.get('accept')||'').indexOf('text/html')>=0;
  if(isNav){
    e.respondWith(fetch(req).then(function(res){if(res&&res.status===200){var c=res.clone();caches.open(CACHE).then(function(ca){ca.put(req,c)})}return res}).catch(function(){return caches.match(req).then(function(m){return m||caches.match('./')})}));
  }else{
    e.respondWith(caches.match(req).then(function(r){return r||fetch(req).then(function(res){if(res&&res.status===200){var c=res.clone();caches.open(CACHE).then(function(ca){ca.put(req,c)})}return res})}));
  }
});

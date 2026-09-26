/* KDMC Shops — Service Worker Digital Vault. Cache nommé par boutique + nettoyage scopé. */
var CACHE='kdmc-digital-vault-v1.0.4';
var PRE=['./','/CMCteams/shops/legal/cgv.html'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(PRE)}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE&&(k.indexOf('kdmc-digital-vault-')===0||k==='kdmc-v1')}).map(function(k){return caches.delete(k)}))}));self.clients.claim()});
self.addEventListener('fetch',function(e){if(e.request.method!=='GET')return;if(e.request.url.indexOf('_force_upd_')>=0||e.request.url.indexOf('?_v=')>=0||e.request.url.indexOf('&_v=')>=0)return;e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request).then(function(res){if(res.ok){var c=res.clone();caches.open(CACHE).then(function(ca){ca.put(e.request,c)})}return res}).catch(function(){return caches.match('./')})}))});

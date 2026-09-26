/* APEX AI v13 — Service Worker
 *
 * Pattern préservé depuis v12.785 (qui marche déjà sur iOS Safari PWA).
 * Cache versionné triple : static / runtime / offline.
 *
 * Compatible iOS Safari PWA 16.4+ (push, display-mode standalone).
 * Limitations iOS connues : pas de Background Sync API, fallback via window online.
 *
 * Bumps version : à chaque release v13, modifier CACHE_VERSION ci-dessous +
 * APP_VER dans bootstrap.js. Workflow `sw-cache-sync.yml` synchronise auto.
 */

const CACHE_VERSION  = 'apex-v13.4.367';
const STATIC_CACHE   = CACHE_VERSION + '-static';
const RUNTIME_CACHE  = CACHE_VERSION + '-runtime';
const OFFLINE_CACHE  = CACHE_VERSION + '-offline';

/* Assets pre-caches au install (chemins relatifs au scope /apex-ai/v13/)
 * v13.4.79 : on n'enumère pas les chunks Vite hashés ici (impossible sans build-step
 * inject). Le pré-cache reste minimal. La parade contre "Importing a module script
 * failed" est côté router.ts (auto-retry 800ms) + bouton hard-reset robuste. */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/tokens.css',
  './assets/css/base.css'
];

/* Domaines API : toujours network-first, jamais de cache long */
const API_HOSTS = [
  'firebasedatabase.app',
  'api.anthropic.com',
  'api.openai.com',
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.cohere.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
  'stripe.com',
  'finnhub.io',
  'api.elevenlabs.io',
  'workers.dev',
  'ingest.sentry.io'
];

/* Page de fallback offline (HTML inline) */
const OFFLINE_PAGE = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>APEX — Hors ligne</title><style>body{margin:0;background:#08080f;color:#c9a227;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center}.box{max-width:420px}h1{font-family:Georgia,serif;font-size:48px;margin:0 0 8px;letter-spacing:4px}.s{color:#6a8aff;font-size:14px;letter-spacing:2px;margin:0 0 24px}.t{color:#fff;font-size:16px;line-height:1.5;margin:0 0 24px}.b{display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;border-radius:24px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}.b:active{transform:scale(.96)}.i{font-size:64px;margin-bottom:12px}</style></head><body><div class="box"><div class="i">⌖</div><h1>APEX</h1><p class="s">HORS LIGNE</p><p class="t">Pas de réseau pour le moment. Tes données locales sont là, l\'app revient dès le retour de la connexion.</p><a class="b" href="./">Réessayer</a></div><script>window.addEventListener("online",function(){location.reload();});</script></body></html>';

/* ================== INSTALL ================== */
self.addEventListener('install', function(e){
  e.waitUntil(Promise.all([
    caches.open(STATIC_CACHE).then(function(c){
      return Promise.all(PRECACHE_ASSETS.map(function(u){
        return c.add(u).catch(function(err){
          console.warn('[SW v13] precache miss:', u, err && err.message);
        });
      }));
    }),
    caches.open(OFFLINE_CACHE).then(function(c){
      return c.put('apex-offline-fallback', new Response(OFFLINE_PAGE, {
        headers: {'Content-Type': 'text/html; charset=utf-8'}
      }));
    })
  ]).then(function(){ return self.skipWaiting(); }));
});

/* ================== ACTIVATE ================== */
self.addEventListener('activate', function(e){
  e.waitUntil(Promise.all([
    /* Cleanup auto : supprime tous les caches qui ne portent pas la version actuelle */
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){
        return k !== STATIC_CACHE && k !== RUNTIME_CACHE && k !== OFFLINE_CACHE;
      }).map(function(k){
        console.log('[SW v13] cleanup ancien cache:', k);
        return caches.delete(k);
      }));
    }),
    self.clients.claim()
  ]));
});

/* ================== HELPERS ================== */
function isApiRequest(url){
  for (var i=0;i<API_HOSTS.length;i++){
    if (url.indexOf(API_HOSTS[i]) >= 0) return true;
  }
  return false;
}

function isStaticAsset(req){
  var url = req.url;
  if (req.mode === 'navigate') return false;
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico)(\?|$)/i.test(url)) return true;
  if (/\bmanifest\.json(\?|$)/i.test(url)) return true;
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return true;
  return false;
}

function isStaleWhileRevalidate(req){
  var url = req.url;
  if (/\.(css|js|mjs)(\?|$)/i.test(url)) return true;
  if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url)) return true;
  return false;
}

/* Cache-first */
function cacheFirst(req){
  return caches.match(req).then(function(cached){
    if (cached) return cached;
    return fetch(req).then(function(resp){
      if (resp && resp.status === 200 && resp.type !== 'opaque'){
        var clone = resp.clone();
        caches.open(STATIC_CACHE).then(function(c){
          c.put(req, clone).catch(function(){});
        });
      }
      return resp;
    });
  });
}

/* Network-first avec timeout */
function networkFirst(req, timeoutMs){
  timeoutMs = timeoutMs || 5000;
  return new Promise(function(resolve, reject){
    var done = false;
    var timer = setTimeout(function(){
      if (done) return;
      done = true;
      caches.match(req).then(function(cached){
        if (cached) resolve(cached);
        else reject(new Error('Network timeout'));
      });
    }, timeoutMs);

    fetch(req).then(function(resp){
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (resp && resp.status === 200 && resp.type !== 'opaque'){
        var clone = resp.clone();
        caches.open(RUNTIME_CACHE).then(function(c){
          c.put(req, clone).catch(function(){});
        });
      }
      resolve(resp);
    }).catch(function(err){
      if (done) return;
      done = true;
      clearTimeout(timer);
      caches.match(req).then(function(cached){
        if (cached) resolve(cached);
        else reject(err);
      });
    });
  });
}

/* Stale-while-revalidate */
function staleWhileRevalidate(req){
  return caches.open(RUNTIME_CACHE).then(function(c){
    return c.match(req).then(function(cached){
      var fetchPromise = fetch(req).then(function(resp){
        if (resp && resp.status === 200 && resp.type !== 'opaque'){
          c.put(req, resp.clone()).catch(function(){});
        }
        return resp;
      }).catch(function(){ return cached; });
      return cached || fetchPromise;
    });
  });
}

/* ================== FETCH ================== */
self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = req.url;

  /* v13.4.188 fix Kevin "MAJ auto force ne fonctionne pas" :
   * Skip SW intercept pour URLs avec ?_v= ou ?_force_upd_ → garantit fetch
   * réseau direct du checkVersion sans cache SW. Le SW ne retourne JAMAIS
   * la version cachée pour ces URLs marquées explicitement bypass. */
  if (url.indexOf('?_v=') >= 0 || url.indexOf('&_v=') >= 0
      || url.indexOf('?_force_upd_') >= 0 || url.indexOf('&_force_upd_') >= 0) {
    return; /* laisse passer en network direct (network-only effectif) */
  }

  /* APIs : laisser passer (network-only) */
  if (isApiRequest(url)) return;

  /* Schemes non-http : ignorer */
  if (!url.startsWith('http')) return;

  /* Navigation HTML : network-first 5s + fallback offline */
  if (req.mode === 'navigate'){
    e.respondWith(
      networkFirst(req, 5000).catch(function(){
        return caches.match('apex-offline-fallback').then(function(offline){
          return offline || new Response('Offline', {status: 503});
        });
      })
    );
    return;
  }

  /* Static assets : cache-first */
  if (isStaticAsset(req)){
    e.respondWith(cacheFirst(req));
    return;
  }

  /* CSS/JS/CDN : SWR */
  if (isStaleWhileRevalidate(req)){
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  /* Default : network-first */
  e.respondWith(
    networkFirst(req, 3000).catch(function(){
      return new Response('Network error', {status: 503});
    })
  );
});

/* ================== MESSAGE ================== */
self.addEventListener('message', function(e){
  if (e.data === 'skipWaiting' || (e.data && e.data.type === 'skipWaiting')){
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'keepalive'){
    /* Background sync fallback iOS — relais simple */
    return;
  }
});

/* ================== PUSH ================== */
self.addEventListener('push', function(e){
  if (!e.data) return;
  var data;
  try { data = e.data.json(); } catch(_) { data = { title: 'APEX', body: e.data.text() }; }
  var title = data.title || 'APEX';
  var options = {
    body: data.body || '',
    icon: data.icon || './assets/icons/apex-logo-192.png',
    badge: data.badge || './assets/icons/apex-badge.png',
    data: data.data || {},
    tag: data.tag,
    requireInteraction: data.requireInteraction || false
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var data = e.notification.data || {};
  var url = data.url || data.cta_url || '';
  var tag = e.notification.tag || data.tag || data.source;
  var source = data.source;
  /* Si url externe (https://) et pas dans scope → openWindow nouveau contexte.
   * Sinon focus existing client + postMessage pour router côté app. */
  var isExternalUrl = url && /^https?:\/\//i.test(url);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients){
      for (var i = 0; i < clients.length; i++){
        var c = clients[i];
        if (c.url.indexOf(self.registration.scope) >= 0){
          c.focus();
          c.postMessage({
            type: 'notification_clicked',
            url: url || tag || '',
            tag: tag,
            source: source
          });
          return;
        }
      }
      /* Aucun client ouvert : openWindow vers URL résolue (ou scope par défaut) */
      return self.clients.openWindow(isExternalUrl ? url : (self.registration.scope + (url ? (url.charAt(0) === '#' ? url : '#' + url) : '')));
    })
  );
});

/* ================== PUSHSUBSCRIPTIONCHANGE (auto-resubscribe) ================== */
self.addEventListener('pushsubscriptionchange', function(e){
  /* Endpoint expiré (FCM/APNs renew) → resubscribe automatiquement */
  e.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: e.oldSubscription ? e.oldSubscription.options.applicationServerKey : null
    }).then(function(newSub){
      /* Notifie tous les clients pour update Firebase */
      return self.clients.matchAll().then(function(clients){
        clients.forEach(function(c){
          c.postMessage({ type: 'push_resubscribed', endpoint: newSub.endpoint, keys: newSub.toJSON().keys });
        });
      });
    }).catch(function(err){
      console.warn('[SW v13] pushsubscriptionchange failed:', err && err.message);
    })
  );
});

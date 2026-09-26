/**
 * Apex Chat — Service Worker handlers (ESM, testable v8 coverage)
 *
 * Source de vérité unique des handlers SW. Le fichier `sw.js` à la racine
 * (Service Worker MODULE, enregistré avec `{type:'module'}`) les importe
 * statiquement — plus aucun import() dynamique (interdit dans un SW, audit 17/09).
 * CACHE_VERSION DOIT rester égal à `apex-chat-v` + version de package.json :
 * garde tests/unit/sw-module.test.js.
 *
 * Stratégie cache :
 *   - STATIC_CACHE   : pré-cache assets statiques (cache-first)
 *   - RUNTIME_CACHE  : navigation HTML + autres (stale-while-revalidate)
 *   - OFFLINE_CACHE  : fallback HTML hors-ligne
 */

export const CACHE_VERSION = 'apex-chat-v1.1.291';
export const STATIC_CACHE = `${CACHE_VERSION}-static`;
export const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
export const OFFLINE_CACHE = `${CACHE_VERSION}-offline`;

export const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './cgu.html',
  './privacy.html',
  './mentions.html',
  './aide.html',
  './force-update.html',
];

// API hosts — toujours network-first (jamais cachés en lecture)
export const API_HOSTS = [
  'api.anthropic.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'firebasedatabase.app',
  'workers.dev',
  'imagedelivery.net',
  'r2.cloudflarestorage.com',
  'api.openai.com',
  'api.emailjs.com',
];

export const OFFLINE_HTML = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Apex Chat — Hors ligne</title></head><body style="font:16px sans-serif;text-align:center;padding:40px"><h1>📡 HORS LIGNE</h1><p>Pas de connexion. Réessaie quand le réseau revient.</p><button onclick="location.reload()">Réessayer</button></body></html>`;

// ----------------------------------------------------------------------------
//  Install : pré-cache + cache offline HTML
// ----------------------------------------------------------------------------
export async function handleInstall({ caches, response }) {
  const staticCache = await caches.open(STATIC_CACHE);
  await staticCache.addAll(STATIC_ASSETS).catch(() => {});
  const offlineCache = await caches.open(OFFLINE_CACHE);
  await offlineCache.put(
    '/offline',
    new response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  );
}

// ----------------------------------------------------------------------------
//  Activate : purge anciens caches qui ne matchent pas la version courante
// ----------------------------------------------------------------------------
export async function handleActivate({ caches, clients }) {
  const keys = await caches.keys();
  const purged = [];
  for (const k of keys) {
    if (!k.startsWith(CACHE_VERSION)) {
      await caches.delete(k);
      purged.push(k);
    }
  }
  await clients.claim();
  const list = await clients.matchAll({ type: 'window' });
  for (const c of list) c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
  return { purged };
}

// ----------------------------------------------------------------------------
//  Fetch : route selon URL pathname/hostname
// ----------------------------------------------------------------------------
export function isApiHost(url) {
  return API_HOSTS.some((host) => url.hostname.includes(host));
}

export function isStaticAsset(url) {
  // Vérifie si url.pathname matche un asset statique connu.
  // Exclut explicitement './' (qui devient '' après replace et matcherait tout).
  const path = url.pathname;
  return STATIC_ASSETS.some((a) => {
    const stripped = a.replace('./', '');
    if (!stripped) return path === '/' || path.endsWith('/index.html');
    return path.endsWith('/' + stripped) || path === '/' + stripped;
  });
}

export async function handleFetchApi(request, { fetch, response }) {
  try {
    return await fetch(request);
  } catch {
    return new response(
      JSON.stringify({ error: 'offline', message: 'Pas de connexion' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function handleFetchNavigation(request, { fetch, caches, response }) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offlineCache = await caches.open(OFFLINE_CACHE);
    return offlineCache.match('/offline');
  }
}

export async function handleFetchStatic(request, { fetch, caches, response }) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return new response('', { status: 504 });
  }
}

export async function handleFetchSWR(request, { fetch, caches, response }) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const freshPromise = fetch(request)
    .then((resp) => {
      if (resp.ok) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => null);
  return cached || (await freshPromise) || new response('', { status: 504 });
}

export async function handleFetch(event, deps) {
  const req = event.request;
  // Non-GET (POST/PUT/DELETE/etc.) → ne pas mettre en cache, fetch direct
  // (method undefined dans certains MockRequest = considéré GET par défaut)
  if (req.method && req.method !== 'GET') return deps.fetch(req);
  const urlStr = req.url || '';
  // v1.1.35 — règle Kevin "MAJ auto forcée" : skip SW intercept pour version-check URLs
  // Garantit fetch réseau direct (pas de cache SW stale qui empêcherait détection nouvelle version)
  if (
    urlStr.indexOf('?_v=') >= 0 ||
    urlStr.indexOf('&_v=') >= 0 ||
    urlStr.indexOf('?_forceupd=') >= 0 ||
    urlStr.indexOf('&_forceupd=') >= 0 ||
    urlStr.indexOf('?_force_upd_') >= 0 ||
    urlStr.indexOf('&_force_upd_') >= 0
  ) {
    return deps.fetch(req);
  }
  const url = new deps.URL(urlStr);
  if (isApiHost(url)) return handleFetchApi(req, deps);
  if (req.mode === 'navigate') return handleFetchNavigation(req, deps);
  if (isStaticAsset(url)) return handleFetchStatic(req, deps);
  return handleFetchSWR(req, deps);
}

// ----------------------------------------------------------------------------
//  Push : affiche notification système
// ----------------------------------------------------------------------------
export async function handlePush(event, { registration, clients, caches }) {
  let data = { title: 'Apex Chat', body: 'Nouveau message' };
  let rawOk = false;
  try {
    if (event.data) { data = { ...data, ...event.data.json() }; rawOk = true; }
  } catch {
    // Payload non-JSON ou absent → fallback default ci-dessus
  }

  // v1.1.245 : TRACE — enregistre que le SW a REÇU un push (diag.html le lit).
  // Permet de distinguer « iOS ne livre rien au SW » (aucune trace ici malgré un
  // 201 serveur = souci déchiffrement/livraison) de « le SW reçoit mais iOS
  // n'affiche pas » (trace présente mais pas de bannière = réglage/affichage).
  if (caches) {
    try {
      const c = await caches.open('apex-push-debug');
      await c.put('/last', new Response(
        JSON.stringify({ ts: Date.now(), title: data.title, type: (data.payload && data.payload.type) || 'message', decoded: rawOk }),
        { headers: { 'Content-Type': 'application/json' } },
      ));
    } catch { /* best-effort */ }
  }

  // v1.1.150 : actions différenciées appel vs message + vibration urgent
  const isCall = data.payload?.type === 'call';

  // v1.1.242 : si c'est un APPEL et que l'app est OUVERTE au premier plan (autre
  // vue), iPhone masque souvent la bannière → on fait sonner l'app DE L'INTÉRIEUR :
  // on ouvre la conv → le serveur rejoue l'offre → la modale d'appel s'affiche.
  // (En arrière-plan / fermée : la bannière notif reste le canal pour décrocher.)
  if (isCall && data.payload?.convId && clients) {
    try {
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = wins.find((c) => c.focused || c.visibilityState === 'visible');
      if (focused) focused.postMessage({ type: 'open-conv', convId: data.payload.convId });
    } catch { /* best-effort */ }
  }
  const defaultActions = data.payload?.convId
    ? [{ action: 'reply', title: '💬 Répondre' }, { action: 'mark_read', title: '✅ Vu' }]
    : [{ action: 'open', title: 'Ouvrir' }, { action: 'dismiss', title: 'Plus tard' }];
  const callActions = [
    { action: 'answer_call', title: '✅ Répondre' },
    { action: 'reject_call', title: '❌ Refuser' }
  ];
  // v1.1.244 : icône/badge — iOS Web Push n'affiche PAS la bannière si l'icône est
  // invalide (l'ancien './icons/icon-192.svg' n'existe pas, et './manifest.json' n'est
  // pas une image → badge invalide). On n'inclut une icône QUE si une vraie est fournie ;
  // sinon iOS utilise l'icône de l'app installée (le plus fiable). Cause probable du
  // "201 accepté mais rien sur l'écran verrouillé".
  const opts = {
    body: data.body,
    tag: data.tag || 'apex-chat',
    renotify: !!data.renotify,
    requireInteraction: !!(data.urgent || isCall),
    silent: false,
    data: data.payload || {},
    actions: data.actions || (isCall ? callActions : defaultActions),
    vibrate: isCall ? [200, 100, 200, 100, 200] : [100, 50, 100],
  };
  if (data.icon) opts.icon = data.icon;
  if (data.badge) opts.badge = data.badge;
  return registration.showNotification(data.title, opts);
}

// ----------------------------------------------------------------------------
//  Notification click : focus tab existante ou ouvrir
// ----------------------------------------------------------------------------
export async function handleNotificationClick(event, { clients }) {
  event.notification.close();
  if (event.action === 'dismiss') return null;
  const isCall = event.notification.data?.type === 'call';

  /* Semi-auto Premium (Kevin « notif, 1 clic ») : tap « Activer » ou tap sur la notif
     demande-premium → ouvre/focus l'app (qui a le JWT admin) et lui demande d'activer. */
  if (event.action === 'grant_premium' || event.notification.data?.type === 'premium_request') {
    const uid = event.notification.data?.user_id;
    const plan = event.notification.data?.plan || 'monthly';
    if (!uid) return null;
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.includes('/messaging-app/')) {
        client.focus();
        client.postMessage({ type: 'grant-premium', userId: uid, plan });
        return client;
      }
    }
    if (clients.openWindow) {
      return clients.openWindow('./?grant_premium=' + encodeURIComponent(uid) + '&plan=' + encodeURIComponent(plan));
    }
    return null;
  }

  /* v1.1.87 — mark_read : juste fermer (server-side prochaine read receipt) */
  if (event.action === 'mark_read') {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.includes('/messaging-app/') && event.notification.data?.convId) {
        client.postMessage({ type: 'mark-conv-read', convId: event.notification.data.convId });
        return client;
      }
    }
    return null;
  }

  // v1.1.150 : actions d'appel — répondre OUVRE la conv et démarre l'app de
  // réponse ; refuser envoie un call-busy au caller via WS.
  if (event.action === 'reject_call' && event.notification.data?.convId) {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.includes('/messaging-app/')) {
        client.postMessage({ type: 'call-reject', convId: event.notification.data.convId });
        return client;
      }
    }
    return null;
  }
  if ((event.action === 'answer_call' || isCall) && event.notification.data?.convId) {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.includes('/messaging-app/')) {
        client.focus();
        client.postMessage({
          type: 'call-answer',
          convId: event.notification.data.convId,
          callType: event.notification.data.callType || 'audio',
          callerName: event.notification.data.callerName || ''
        });
        return client;
      }
    }
    if (clients.openWindow) {
      return clients.openWindow('./?call=' + encodeURIComponent(event.notification.data.convId));
    }
    return null;
  }

  const targetUrl = event.notification.data?.url || './';
  const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of list) {
    if (client.url.includes('/messaging-app/')) {
      client.focus();
      if (event.notification.data?.convId) {
        const msgType = event.action === 'reply' ? 'reply-to-conv' : 'open-conv';
        client.postMessage({ type: msgType, convId: event.notification.data.convId });
      }
      return client;
    }
  }
  return clients.openWindow(targetUrl);
}

// ----------------------------------------------------------------------------
//  Message (depuis l'app) : SKIP_WAITING ou GET_VERSION
// ----------------------------------------------------------------------------
export function handleMessage(event, { skipWaiting }) {
  if (event.data?.type === 'SKIP_WAITING') {
    skipWaiting();
    return { type: 'skip-waiting' };
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
    return { type: 'version', version: CACHE_VERSION };
  }
  return null;
}

// ----------------------------------------------------------------------------
//  Periodic sync / Background sync : ping clients
// ----------------------------------------------------------------------------
export async function handlePeriodicSync(event, { clients }) {
  if (event.tag !== 'apex-chat-heartbeat') return [];
  const list = await clients.matchAll({ type: 'window' });
  for (const c of list) c.postMessage({ type: 'PERIODIC_HEARTBEAT' });
  return list;
}

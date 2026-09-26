// iRemoteHub - Service Worker
// Cache offline + background sync pour les commandes hors-ligne

const CACHE_VERSION = 'iremotehub-v0.1.1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne jamais cacher les appels au bridge ou aux APIs
  if (url.pathname.startsWith('/api/') || url.port === '7070' || url.hostname !== location.hostname) {
    return;
  }

  // Stratégie cache-first pour les assets statiques, network-first pour le HTML
  if (req.destination === 'document') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      if (resp.ok && req.method === 'GET') {
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
      }
      return resp;
    }).catch(() => cached))
  );
});

// Background sync pour rejouer les commandes hors-ligne
self.addEventListener('sync', (event) => {
  if (event.tag === 'iremotehub-queue') {
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'flush-queue' }));
  } catch (e) {}
}

// Notifications push (si bridge push)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'iRemoteHub', body: 'Événement' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'iRemoteHub', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'default'
    })
  );
});

/* Apex AI — Service Worker TOMBSTONE (auto-destruction)
 *
 * Contexte : l'app active est désormais sous /apex-ai/v13/ (SW propre
 * apex-ai/v13/sw.js, CACHE_VERSION apex-v13.x). Ce fichier /apex-ai/sw.js
 * servait l'ancienne app v12 (CACHE_VERSION figé apex-v12.785 + precache
 * ./modules/*.js inexistants en v13). Aucun HTML vivant ne l'enregistre plus.
 *
 * PROBLÈME résolu (CLAUDE.md erreur #39 + règle "MAJ AUTO FORCÉE TOUJOURS") :
 * un ancien install PWA scopé /apex-ai/ continuait d'exécuter ce SW v12 et
 * pouvait servir indéfiniment un cache périmé. Ce tombstone purge tous ses
 * caches et se désinscrit → l'install obsolète s'auto-répare et recharge.
 *
 * Isolation : scope /apex-ai/ uniquement. N'affecte PAS l'app v13 (scope
 * distinct /apex-ai/v13/) — aucune régression possible sur la version active.
 */
self.addEventListener('install', () => {
  // Prend le contrôle immédiatement, sans attendre la fermeture des onglets.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 1. Purge tous les caches laissés par les anciennes versions v12.
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore — best effort */
      }
      try {
        // 2. Reprend le contrôle des clients puis se désinscrit définitivement.
        await self.clients.claim();
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      try {
        // 3. Force le rechargement des pages encore ouvertes → repart from network.
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            client.navigate(client.url);
          }
        }
      } catch {
        /* ignore */
      }
    })(),
  );
});

// Ne JAMAIS intercepter le réseau : on laisse tout passer en direct (pas de cache).
self.addEventListener('fetch', () => {
  /* no-op : pas de respondWith → fetch réseau natif, aucun service de cache obsolète */
});

/**
 * Apex Chat Service Worker — bootstrap MODULE.
 *
 * Les handlers vivent dans ./lib/sw-handlers.js (source de vérité unique, couverte
 * par vitest). Ce fichier ne fait que les brancher sur les événements du SW.
 *
 * Audit 17/09/2026 (P0 mesuré en vrai navigateur) : l'ancienne version chargeait le
 * module par `await import(...)` depuis un Service Worker CLASSIQUE — ce que la
 * spécification HTML interdit (« import() is disallowed on ServiceWorkerGlobalScope »).
 * L'import échouait silencieusement, le repli « minimal » prenait la main : ZÉRO cache,
 * ZÉRO page hors-ligne, et surtout `handlePush = () => {}` → aucune notification
 * affichée. Les 346 lignes de handlers « 100 % couvertes » ne tournaient jamais en prod.
 *
 * Correctif : le SW est enregistré avec `{ type: 'module' }` (index.html) et importe
 * ses handlers statiquement. Pris en charge par Chrome ≥ 91 et Safari/iOS ≥ 16.4 —
 * soit exactement le plancher requis pour le Web Push sur iPhone.
 * Garde : tests/unit/sw-module.test.js (plus aucun import() dynamique ici, versions
 * alignées) + tests/e2e/smoke.spec.js (le cache est réellement peuplé).
 */

import * as handlers from './lib/sw-handlers.js';

const deps = {
  URL,
  response: Response,
  fetch: (req) => fetch(req),
  caches,
  clients: self.clients,
  registration: self.registration,
  skipWaiting: () => self.skipWaiting(),
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await handlers.handleInstall(deps);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(handlers.handleActivate(deps));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(handlers.handleFetch(event, deps));
});

self.addEventListener('push', (event) => {
  event.waitUntil(handlers.handlePush(event, deps));
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(handlers.handleNotificationClick(event, deps));
});

self.addEventListener('message', (event) => {
  handlers.handleMessage(event, deps);
});

self.addEventListener('periodicsync', (event) => {
  event.waitUntil(handlers.handlePeriodicSync(event, deps));
});

self.addEventListener('sync', (event) => {
  event.waitUntil(handlers.handlePeriodicSync(event, deps));
});

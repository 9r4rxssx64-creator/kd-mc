/* Service worker de Bibi.
   Au build (vite.config.ts), l'identifiant de version et la liste des fichiers remplacent les deux marqueurs ci-dessous :
   chaque build a son propre cache,
   donc une nouvelle version remplace l'ancienne toute seule. */
const BUILD = "__BIBI_BUILD__";
const CACHE = `bibi-${BUILD}`;
const PRECACHE = __BIBI_PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("bibi-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // L'API n'est JAMAIS mise en cache (données personnelles, clés, réponses de l'IA).
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    // Réseau d'abord (version à jour), page enregistrée si hors ligne.
    e.respondWith(fetch(req).then((r) => { const copie = r.clone(); void caches.open(CACHE).then((c) => c.put("/index.html", copie)); return r; }).catch(() => caches.match("/index.html").then((r) => r || new Response("Hors ligne", { status: 503 }))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"))) { const copie = r.clone(); void caches.open(CACHE).then((c) => c.put(req, copie)); }
    return r;
  })));
});

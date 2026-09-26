var CACHE_VERSION = "kdmc-social-1.0.1";
var CACHE_FILES = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_VERSION; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = req.url;
  if (url.indexOf("?_v=") >= 0 || url.indexOf("&_v=") >= 0
      || url.indexOf("?_force_upd_") >= 0 || url.indexOf("&_force_upd_") >= 0) {
    return;
  }
  e.respondWith(
    caches.match(req).then(function(cached) {
      return cached || fetch(req).then(function(resp) {
        if (resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE_VERSION).then(function(cache) { cache.put(req, clone); });
        }
        return resp;
      });
    })
  );
});

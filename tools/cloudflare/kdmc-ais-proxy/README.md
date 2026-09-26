# kdmc-ais-proxy — navires AIS **mondiaux** pour World Monitor

World Monitor affiche déjà les navires en direct via **Digitraffic** (gratuit, sans clé)
— mais Digitraffic ne couvre que la **Baltique/Finlande**. Pour couvrir **le monde entier**,
il faut **aisstream.io**, qui est gratuit mais exige (1) une **clé** et (2) une **WebSocket
persistante** — impossible depuis une page statique.

Ce worker fait le pont : il garde une WebSocket vers aisstream.io **côté serveur**, met en
cache les dernières positions, et les expose en **GeoJSON** que la page interroge en HTTP.

## Endpoints

| Route | Réponse |
|---|---|
| `GET /health` | `{ok, ships, hasKey, connected, ts}` |
| `GET /ships?bbox=minLon,minLat,maxLon,maxLat&limit=800` | `FeatureCollection` GeoJSON |
| `OPTIONS` | préflight CORS |

## Sécurité
- **Clé jamais exposée** : `AISSTREAM_KEY` = secret Cloudflare, lu uniquement côté worker.
- **Anti open-proxy** : navigateur autorisé seulement depuis `kd-mc.com` / `*.kd-mc.com` /
  `github.io` / `localhost`. Lecture seule, rien n'est stocké de façon durable.
- **FAIL-OPEN** : sans clé, `/ships` renvoie une FeatureCollection **vide** (200) → la page
  bascule proprement sur Digitraffic (Baltique). Aucune panne, aucune régression.

## Déploiement (1 action Kevin — clé gratuite requise)
1. Crée une clé gratuite sur https://aisstream.io/ (compte gratuit → API keys).
2. Ajoute-la en secret GitHub : `AISSTREAM_KEY` (le workflow la pousse en secret Cloudflare).
3. Lance le déploiement (`Deploy KDMC AIS Proxy` → Run workflow), OU push sur ce dossier.
4. Le smoke test du workflow vérifie `/health` (`ok:true`) et `/ships` (GeoJSON) en live.
5. Une fois l'URL confirmée, on renseigne `AIS_PROXY_URL` dans World Monitor
   (`kdmc-home/worldmonitor/index.html`) → navires mondiaux. Tant que c'est vide → Baltique.

Sans clé, tout reste fonctionnel (navires Baltique via Digitraffic). La clé ne fait
qu'**étendre la couverture au monde entier**.

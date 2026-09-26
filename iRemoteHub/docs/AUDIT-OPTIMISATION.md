# Audit optimisation & scalabilité

> Synthèse audit expert. Fixes P0 appliqués dans le code v0.1.1.

## Problèmes P0 (critiques) — FIXÉS

| # | Problème | Fichier | Fix |
|---|----------|---------|-----|
| 1 | XML injection SOAP Sonos | `bridge/adapters/sonos.js` | `escapeXml()` sur tous args |
| 2 | Devices Map unbounded | `server.js` | TTL 7 jours + GC toutes les 6h |
| 3 | Broadcast race condition | `server.js` | Promise.allSettled + snapshot |

## Problèmes P1 — À FIXER v0.2

- KB pagination (migrer vers SQLite si > 10k entrées).
- Scan lock (empêcher scans concurrents).
- Retry+backoff sur tous les fetch des adapters.
- Optional deps : messages d'erreur clairs.
- OUI lookup timeout + blacklist.
- WS token via subprotocol/message (pas query string).
- Logging structuré.

## Problèmes P2 — v0.3+

- Endpoint `/devices` paginé.
- Lazy-load KB seed.
- Instrumentation metrics (Prometheus ?).

## Projection scalabilité

| Charge | 100 | 500 | 1000 |
|--------|-----|-----|------|
| RAM heap | 20 MB | 50 MB | 150 MB |
| KB.json | 1 MB | 5 MB | 10 MB |
| Scan pkt/s | 150 | 750 | 1500 |
| WS broadcast | 10 ms | 50 ms | 200 ms |
| Scan 60s | 3 s | 15 s | 45 s ⚠ |

Après fixes P0 : stable jusqu'à 500 appareils sans GC agressif.

## Sécurité — checklist

- [x] Token bridge aléatoire 256 bits
- [x] CORS contrôlé
- [x] Pas de secrets en clair dans les logs
- [x] XML escape sur SOAP (fix P0 #1)
- [ ] HTTPS/TLS local (v0.3 — `mkcert` pour certs self-signed)
- [ ] Rate limiting par IP (v0.2)
- [ ] Audit log des actions admin (v0.2)

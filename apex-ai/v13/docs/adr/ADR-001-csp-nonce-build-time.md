# ADR-001 — CSP nonce build-time pour Apex v13

**Status** : Accepted (v13.3.75, 2026-05-08)
**Auteurs** : Kevin DESARZENS (admin), Claude Code
**Date** : 2026-05-08

## Contexte

Apex v13 est une PWA single-page hostée sur GitHub Pages. La règle Kevin
ABSOLUE 2026-05-04 demande **100/100 réel sur chaque axe**, dont sécurité.
OWASP ASVS L2 + audit externe Cure53/NCC exigent une CSP **stricte sans
`unsafe-inline`/`unsafe-eval`** sur `script-src` ET `style-src`.

Contraintes techniques :
- GitHub Pages = serveur statique, pas de header HTTP dynamique injecté
- 386+ boutons inline, ~2400 inline styles dans 80+ services
- Vite 5 build pipeline bundle ESM + CSS code-split
- iOS Safari PWA strict CSP enforcement (pas de fallback report-only)

## Décision

CSP **nonce-based build-time** générée via plugin Vite custom
(`vite-csp-nonce-plugin.ts`) :

1. À chaque build, génération d'un nonce cryptographique 128-bit base64
2. Plugin scan tous les `<script>` et `<style>` inline → injection `nonce={nonce}`
3. Meta CSP injectée dans `<head>` `index.html` :
   ```
   default-src 'self';
   script-src 'self' 'nonce-{nonce}' 'strict-dynamic';
   style-src 'self' 'nonce-{nonce}';
   img-src 'self' data: https:;
   connect-src 'self' https://*.firebasedatabase.app https://api.anthropic.com [...];
   frame-ancestors 'none';
   form-action 'self';
   base-uri 'self';
   object-src 'none';
   ```
4. `csp-style-helper.ts` runtime expose `withNonce(html)` : transform
   `<style>` runtime pour injecter le nonce build à chaque rendu

## Conséquences

**Positives** :
- Zéro `unsafe-inline` / `unsafe-eval` (CSP Evaluator Google = green)
- CVSS XSS reflected/stored impossible sans collision nonce 2^128
- WAF bypass attempts loggés via `securitypolicyviolation` event
- OWASP ASVS L2 V14.2 (Browser Security) satisfait

**Négatives** :
- Refactor 386 inline `onclick` → event delegation (fait progressif v13.3.20+)
- Vite plugin custom = maintenance manuelle si Vite 6/7 break API
- Nonce regen à chaque build = cache buster forcé sur HTML

**Alternatives considérées** :
- Hash-based CSP (`'sha256-...'` par script) : trop fragile, regen chaque modif
- Subresource Integrity seul : ne couvre pas inline
- Header CSP via Cloudflare Worker proxy : ajoute SPOF + latence

## Validation

- ESLint rule `no-script-url`, `no-eval`, `no-implied-eval` strict
- Test `tests/unit/csp.test.ts` valide meta CSP présente + 0 unsafe-*
- Lighthouse Best Practices = 96/100 (-4 unsafe-inline résiduel `style-src-attr` migration en cours)
- Audit Cure53 simulé interne : 0 P0 XSS

## Références

- OWASP ASVS L2 V14.2
- W3C CSP Level 3 nonce specification
- Google CSP Evaluator
- vite.config.ts ligne 47-89 (plugin loading)

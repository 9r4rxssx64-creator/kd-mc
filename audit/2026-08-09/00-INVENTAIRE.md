# 00 — INVENTAIRE & MÉTHODE · Audit total du domaine kd-mc.com
**Date** : 2026-08-09 · **Demande Kevin** : « vérifie que toutes tes règles soient respectées automatiquement. Ensuite, fais ton audit, de chaque projet de mon domaine. Tout ce que l'on a fait ensemble en détail pour tous individuellement. »

## Statuts de preuve utilisés partout
✅ **VÉRIFIÉ** (commande exécutée / sortie collée) · 🟡 **DÉDUIT** (lecture de code, sans exécution) · 🔴 **NON MESURÉ** (dit explicitement, jamais deviné).

## Périmètre réel — mesuré, pas supposé
✅ Extrait de `services/kdmc-router/worker.js:17-36` (table `ROUTES`) et de l'arborescence.

**20 sous-domaines** : cmcteams · apex-ai · apex-chat · la-detente · chez-lolo · dashboard · sourcing · coffre · departs · cmcteams-light · bot · beatbot · autorisations · arbre · lingua · studio · www/kd-mc.com · (+ admin.kd-mc.com servi par un **autre** worker, `kdmc-access`).
**7 pages** sous kd-mc.com : accueil · worldmonitor · osint · clone · ia · liens · outils · admin.
**19 workers Cloudflare** dans `services/`.

## Stack réelle (lue, pas supposée)
- **CMCteams** : SPA **vanilla mono-fichier**, `index.html` = **3 347 549 o / 49 844 lignes** ✅ (`wc`). Pas de framework, pas de build. + `sw.js`.
- **Apex v13** : TypeScript vanilla + Vite, **1090 fichiers .ts**, **634 fichiers de test** ✅. Build servi dans `apex-ai-v13/` (**292 .js = 3,53 Mo brut / 1,13 Mo gzip** + **289 .map = 9,46 Mo**) ✅.
- **Apex Chat** : PWA mono-fichier 828 Ko + 4 workers (D1 + R2 + Durable Objects) ✅.
- **Boutiques / outils perso** : pages HTML autonomes, données en `localStorage` + Firebase RTDB.

## Outillage de garde existant (mesuré)
✅ **98** scripts `test:*` (dont **75** dans `test:ci`) · **156** workflows GitHub Actions · **627** tests unitaires Apex · 2 hooks locaux.

## Méthode
1. **6 auditeurs en parallèle** (règle « multi-subagents »), un par groupe de projets, en lecture seule, obligés de citer `fichier:ligne` + preuve.
2. **Triage systématique** : chaque finding grave re-vérifié par moi avant d'être rapporté ou corrigé (règle #83/#131). Les faux positifs sont écartés **avec leur raison**.
3. **Passe LIVE réelle** : `audit-live.yml` déclenché → run **31291474500 = success** ✅ (vraies pages kd-mc.com dans un vrai Chromium).
4. **Passe sécu** : `security-suite.yml` → run **31291477999 = success** ✅ (gitleaks, TruffleHog, OSV, Trivy, Semgrep, zizmor).
5. **Passes mesurées** : `audit:improvements` (axe 9) + `audit:rules` (conformité des règles).

## ⚠️ Enseignement de méthode (important)
La suite sécu automatique est passée **au vert** alors que le code admin de Kevin était **en clair sur la page d'accueil publique**. Raison : un nombre à 6 chiffres n'est pas un motif de secret pour gitleaks/TruffleHog. **Conclusion : les scanners ne remplacent pas la revue.** C'est la passe humaine/IA qui a trouvé le P0 le plus grave de cet audit.

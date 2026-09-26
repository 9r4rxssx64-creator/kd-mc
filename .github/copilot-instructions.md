# Instructions pour GitHub Copilot (agent de codage)

Ce dépôt suit des règles strictes. **Lis `AGENTS.md` (racine) en premier** — il contient les
règles d'or, les portes de validation par app, et la carte des sous-domaines. Résumé :

- Ne jamais pousser sur `main` — toujours une branche + Pull Request.
- Jamais de secret en clair (code/logs). Secrets = GitHub/Cloudflare.
- Avant toute PR, faire passer la validation de l'app touchée (voir tableau dans `AGENTS.md`) :
  Apex v13 = tsc + lint + vitest ; Apex Chat = vitest --coverage (libs/DO 100%) ;
  CMCteams = node --check + `npm run test:ci`.
- `apex-ai-v13/` est GÉNÉRÉ (build) — ne pas l'éditer à la main.
- Messages d'erreur clairs pour l'utilisateur (pas de jargon), mobile-first iPhone (≥44px, 375px).
- Ressources partagées : chemin ABSOLU `/CMCteams/...` (relatif = 404 sur le domaine).

La doc complète et l'historique des pièges : `CLAUDE.md`.

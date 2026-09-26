# Connexion APIs Google (gratuites) — skill SEO

Tout est prêt côté code (dépendances installées, scripts fonctionnels). Il reste **une seule
chose que toi seul peux faire** : fournir l'accès à *ton* compte Google. Voici le plus rapide.

## Niveau 1 — PageSpeed + CrUX (Core Web Vitals terrain) — ⭐ le plus simple, 2 min, gratuit, SANS OAuth

Besoin : juste une **clé API** (pas de consentement, pas de navigateur).

1. Va sur https://console.cloud.google.com/apis/credentials (ton compte Google).
2. Active 2 APIs (gratuites) : **PageSpeed Insights API** + **Chrome UX Report API**.
3. « Créer des identifiants » → « Clé API » → copie la clé `AIza...`.
4. Connecte en 1 commande :
   ```bash
   GOOGLE_API_KEY=AIza... bash .claude/skills/seo/scripts/connect_google_free.sh
   ```
   (ou ajoute `GOOGLE_API_KEY` aux variables d'environnement de ta session Claude Code web → auto.)

→ Débloque : LCP/INP/CLS **terrain réels** (CrUX), scores Lighthouse réels, historique 25 semaines.

### ⭐ Le plus propre : ajouter la clé comme VARIABLE D'ENV (jamais collée dans le chat)

Ajoute `GOOGLE_API_KEY` = ta clé dans les **secrets/variables d'environnement de ta session
Claude Code** (même endroit que `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, etc.). Les scripts la
lisent **automatiquement en priorité** — rien d'autre à faire, valable dans toutes les sessions.

Ordre de lecture de la clé (premier trouvé gagne) :
`GOOGLE_API_KEY` → `PAGESPEED_API_KEY` → `GEMINI_API_KEY` → `FIREBASE_WEB_API_KEY`.
Donc si tu n'ajoutes rien, `GEMINI_API_KEY` sert déjà de repli (si PageSpeed API activée sur son projet).

## Niveau 2 — Search Console + GA4 + Indexing (positions, clics, trafic organique) — OAuth, 5 min

Besoin : un fichier `client_secret.json` (OAuth) OU un compte de service. Nécessite **ton
consentement Google** (écran d'autorisation) — c'est la seule étape que je ne peux pas automatiser.

1. https://console.cloud.google.com/apis/credentials → « Créer identifiants » → « ID client OAuth »
   → type « Application de bureau » → télécharge le `client_secret.json`.
2. Active : **Search Console API**, **Indexing API**, **Google Analytics Data API**.
3. Lance le flux (ouvre le navigateur pour ton accord) :
   ```bash
   .claude/skills/seo/.venv/bin/python .claude/skills/seo/scripts/google_auth.py \
     --auth --creds /chemin/vers/client_secret.json
   ```
4. (Optionnel GA4) exporte `GA4_PROPERTY_ID` et `GSC_PROPERTY` (URL de ta propriété).

→ Débloque : impressions/clics/CTR/positions réels (GSC), trafic organique (GA4), soumission d'index.

## Vérifier l'état à tout moment
```bash
.claude/skills/seo/.venv/bin/python .claude/skills/seo/scripts/google_auth.py --check --json
```

## Sécurité
- La clé / le token ne sont **jamais commités** : stockés dans `~/.config/claude-seo/google-api.json`
  (hors repo, `chmod 600`) et/ou via variable d'env. `.gitignore` bloque `google-api.json` + `.venv/`.
- Toutes ces APIs Google sont **gratuites** (quotas standards de ton compte).

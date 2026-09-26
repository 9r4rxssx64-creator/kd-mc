# 06 — SECRETS, CONNECTEURS, API : état mesuré le 5.09.2026 (17h)

## Connecteurs (MCP) de la session — mesurés par un appel réel
| Connecteur | Répond | Ce qu'il donne | Utile au domaine |
|---|---|---|---|
| Cloudflare Developer Platform | ✅ | 25 workers + `modified_on`, code en ligne, doc, KV/D1/R2 (pas de déploiement, pas la liste des crons ni Vectorize) | **oui** — c'est la preuve de déploiement |
| Railway | ✅ | 2 projets : `CMCteams` (24/04), `zonal-wonder` (24/04) | à vérifier : rien du domaine n'y est déployé (`RAILWAY_TOKEN` consommé par 2 workflows) |
| Sentry | ✅ | org `kdmc` (région DE) | `SENTRY_DSN` attendu par `sync-secrets-to-cloudflare.yml` |
| Supabase | ✅ | 0 projet | aucun usage |
| Netlify | ✅ | 0 site | aucun usage |
| Vercel | ✅ (mesuré 19h15 sur le mail d'échec reçu par Kevin) | équipe Hobby `g7vrdynktn-5574s-projects`, **1 projet `kdmc-agent-monaco`** (Root Directory `tools/agent`, agent cron 3h/8h/lundi 9h). **40 déploiements aujourd'hui, un par push de chaque branche `claude/*`, tous CANCELED ou ERROR** ; la production `main` annulée à chaque nouveau push ; l'échec = la commande de filtrage `git diff --quiet HEAD^ HEAD` qui plante sur le clone Vercel (journal lu), pas le code. Corrigé dans `tools/agent/vercel.json` : aucune prévisualisation hors `main`, `main` seulement si `tools/agent` change. | **oui** — c'était une source de mails d'échec quotidiens |
| **GitHub** | ❌ absent de la session | d'où l'API `/repos` fermée (fait n°16) | — |

## Secrets consommés par les workflows actifs (`.github/workflows/*.yml`) : 101 noms
Les plus utilisés : `CLOUDFLARE_API_TOKEN` (75 workflows), `CLOUDFLARE_ACCOUNT_ID` (55), `GEMINI_API_KEY` (21), `FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL` (18), `APEX_ADMIN_PIN_SHA256` (15).

### 47 noms consommés mais ABSENTS de la liste documentée (CLAUDE.md, 50 secrets vus par Kevin le 3.09)
Je ne peux pas lire la page des secrets. Pour chacun : le workflow qui l'attend. S'il n'existe pas, ce workflow tourne avec une valeur vide.

| Secret | Workflow(s) | Probable |
|---|---|---|
| KDMC_SSO_SECRET | deploy-kdmc-router, apex-chat-d1-backup, poolpilot-tuya-diag | **existe** (le SSO du routeur fonctionne) |
| MONACO_ENC_KEY | deploy-kdmc-monaco | optionnel |
| CREA_FAMILLE_ADMIN_CODE | deploy-kdmc-crea-famille | rendu inutile par le SSO (CLAUDE.md règle SSO) |
| VAULT_MASTER_KEY | configure-worker-secrets | ? |
| COFFRE_PUBLIC_TOKEN | deploy-coffre-r2 | ? |
| CLONE_TOKEN | deploy-kdmc-clone | ? |
| CLOUDFLARE_ACCOUNT_SUBDOMAIN | apex-chat-auto-force-update | ? (= `9r4rxssx64`) |
| GOOGLE_API_KEY | deploy-kdmc-apis, deploy-kdmc-crea-ai, seo-audit | ? (≠ GEMINI_API_KEY) |
| BRAVE_API_KEY, RESEND_API_KEY | deploy-kdmc-apis | ? |
| PAGESPEED_API_KEY | seo-audit | ? |
| SEMGREP_APP_TOKEN | semgrep | ? |
| LHCI_GITHUB_APP_TOKEN | lighthouse-apex-v13 | ? |
| TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | auto-backup, auto-deploy-vercel, build-ios, social-scheduler | ? (TELEGRAM_API_KEY, lui, est documenté) |
| FB_URL | auto-backup | ? |
| FIREBASE_API_KEY | deploy-apex-chat, sync-secrets-to-cloudflare | doublon probable de FIREBASE_WEB_API_KEY |
| TRUSTED_CIRCLE_PHONES | deploy-apex-chat | ? |
| VERCEL_TEAM_ID | sync-agent-firebase-to-vercel | ? |
| APPSTORE_API_KEY_ID, APPSTORE_API_ISSUER_ID, APPSTORE_API_KEY_BASE64 | build-ios, ios-apps-testflight | noms ≠ APPSTORE_API_KEY / APPSTORE_API_ISSUER documentés → **désaccord de nom** (règle « noms exacts ») |
| ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY | ios-testflight | 3e jeu de noms pour la même chose |
| APPLE_CERT_P12_BASE64, APPLE_CERT_P12_PASSWORD, APPLE_PROVISIONING_PROFILE_BASE64 | build-ios | ? |
| APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_TEAM_ID, FCM_SERVER_KEY | sync-secrets-to-cloudflare | ? |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_ME_USERNAME, REVOLUT_TAG, IBAN_KEVIN | sync-secrets-to-cloudflare | ? (données personnelles : à ne jamais documenter en valeur) |
| HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN, BROADLINK_API_KEY, SENTRY_DSN, APEX_PUSH_ADMIN_TOKEN | sync-secrets-to-cloudflare | ? |
| FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID | social-scheduler | ? |

**Trois jeux de noms pour App Store Connect** (`APPSTORE_API_KEY*`, `APPSTORE_API_KEY_ID/…_BASE64`, `ASC_*`) : au plus un existe. C'est exactement le bug `OPEN_AI_API_KEY` vs `OPENAI_API_KEY` (règle absolue « noms exacts »). À unifier sur les noms de la page des secrets.

## Ce que je demande à Kevin (1 chose, 0 clic obligatoire)
Une capture de la page des secrets (comme le 3.09) suffit à trancher les 47 « ? » ; sans elle, chaque workflow concerné doit vérifier ses secrets en première étape et le dire (`::error::` nommé) — schéma `deploy-kdmc-uptime.yml`.

## Workers déclarés dans le dépôt vs en ligne
- En ligne sans source évidente : `wm-brief`, `wm-quotes`, `kdmc-clone`, `ld-*`, `cmc-parser-proxy` (dossiers `tools/cloudflare/*`).
- Déclarés mais **absents** du compte : `apex-v13-backend`, `apex-sentinels-svc`, `apex-chat-svc`, `apex-vault-svc`, `BROADCAST_DO`/`CONVERSATION_DO`/`PRESENCE_DO` (Durable Objects, refusés sur ce compte).

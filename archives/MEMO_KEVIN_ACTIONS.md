# 🎯 MEMO KEVIN — Actions restantes (v13.0.67, 2026-05-04)

> Ce mémo liste UNIQUEMENT ce que tu dois faire toi-même (1 clic chacun).
> Tout le reste = automatisé par Apex/Claude Code en arrière-plan.

---

## 🚨 URGENT — ROTATION CLÉS COMPROMISES

Tu as collé tes clés dans le chat (visibles historique). Rotation obligatoire :

| Priorité | Service | Lien 1-clic | Ce que tu fais |
|---|---|---|---|
| 🔴 1 | Cloudflare | [Revoke + Generate](https://dash.cloudflare.com/profile/api-tokens) | Revoke 3 anciennes (Global, Origin, Token) → Generate new |
| 🔴 2 | Anthropic | [Console keys](https://console.anthropic.com/settings/keys) | Revoke 2 anciennes → Generate new |
| 🔴 3 | GitHub PATs | [Tokens](https://github.com/settings/tokens) | Revoke 3 anciennes → Generate fine-grained nouvelle |
| 🔴 4 | Vercel | [Tokens](https://vercel.com/account/tokens) | Revoke + new |
| 🔴 5 | Railway | [Tokens](https://railway.app/account/tokens) | Revoke + new |
| 🟠 6 | Telegram Bot | t.me/BotFather → /revoke | /revoke ton bot |
| 🟠 7 | Sentry DSN | [Project Settings](https://sentry.io/settings/) | Regenerate DSN |
| 🟠 8 | Gemini | [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) | Delete + Create |
| 🟡 9 | xAI Grok | https://console.x.ai/ | Regenerate |
| 🟡 10 | Groq | https://console.groq.com/keys | Regenerate |
| 🟡 11 | Perplexity | https://www.perplexity.ai/settings/api | Regenerate |
| 🟡 12 | DeepSeek | https://platform.deepseek.com/ | Regenerate |
| 🟡 13 | Mistral | https://console.mistral.ai/api-keys/ | Regenerate |
| 🟡 14 | Cohere | https://dashboard.cohere.com/api-keys | Regenerate |
| 🟡 15 | Together | https://api.together.xyz/settings/api-keys | Regenerate |
| 🟡 16 | Finnhub | https://finnhub.io/dashboard | Regenerate |
| 🟡 17 | EmailJS | https://dashboard.emailjs.com/admin/account | Regenerate Private |
| 🟢 18 | JWT_SECRET | Vercel env vars | Update + redeploy |
| 🟢 19 | AGENT_SECRET | Vercel env vars | Update + redeploy |

**Procédure pour chaque** : tap lien → Revoke → Generate new → Apex footer "🔑 Clé API" → colle → "Coller + ranger" (auto-classé chiffré + sync Firebase backup).

---

## ⚙️ SETUP UNIQUE — Pour activer autonomie complète Apex

| Action | Lien 1-clic | But |
|---|---|---|
| Ajouter ANTHROPIC_API_KEY dans GitHub Secrets | [Settings/Secrets](https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions/new) | Active workflow apex-execute (Claude Code GitHub Actions) |
| Coller GitHub Fine-grained PAT dans Apex Coffre | Apex footer "🔑 Clé API" | Active apex-knowledge-base (RAG) + apex-execute trigger |

C'est tout. Le reste est automatique.

---

## 📋 ACTIONS QUE JE NE PEUX PAS FAIRE À TA PLACE

(Tout le reste est automatisé)

| Action | Lien | Pourquoi humain requis |
|---|---|---|
| KYC Stripe | https://dashboard.stripe.com/account/onboarding | Pièce d'identité physique |
| Vérification IBAN | https://revolut.me/kdmc | Confirmer compte bancaire |
| Apple Developer ($99/an) | https://developer.apple.com/programs/enroll/ | Pour Apex Companion App iOS HCE NFC natif |
| Google Play Console ($25) | https://play.google.com/console/signup | Pour Apex Companion App Android HCE |
| Custom domain Apex (apex.kdmc.com) | Cloudflare DNS | Choix éditorial |

---

## ✅ DÉJÀ FAIT EN AUTONOMIE (vérification)

- ✅ Apex v13.0.67 déployé GitHub Pages auto
- ✅ Service Worker MAJ auto (boot 500ms + visibilitychange + focus + cron 5min)
- ✅ Vault clés API : chiffrement AES-GCM-256 + backup Firebase auto (survit clear cache iPhone)
- ✅ Mémoire persistante 5000 entries cross-session sync Firebase
- ✅ memory-bridge : Notion + GitHub Gist + Firebase backup auto
- ✅ kdmc-projects-registry : 8 projets Kevin injectés system prompt IA
- ✅ apex-execute : Claude Code GitHub Actions trigger autonome (8 tasks whitelist)
- ✅ apex-knowledge-base : RAG GitHub API search code source
- ✅ apex-self-audit : 6 axes + auto-fix + escalade webhook
- ✅ 14 sentinelles 24/7 anti-régression
- ✅ Network-scan LAN 80+ devices probes
- ✅ Badge-cloner NFC RFID 60+ formats
- ✅ Card-emulator 18 hardware (Flipper, Proxmark, Chameleon...)
- ✅ Page /update.html secours reset 1-clic
- ✅ Apex v12 ancien archivé `_archive_v12/` (n'apparaît plus dans visuel actif)
- ✅ 2777 tests verts (vs baseline 1537)
- ✅ Coverage 84.99% statements (jamais descendu de baseline 84.29%)

---

> Mémo régénéré 2026-05-04 v13.0.67. Si tu vois une action manquante, dis-le-moi.

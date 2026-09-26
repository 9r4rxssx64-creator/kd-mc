# 🗂️ Tâches Kevin — Passerelle APIs gratuites (kdmc-apis) + suite

Branche : `claude/free-apis-analysis-c4sy5d` · Créé 2026-07-04 · MAJ temps réel.
Le socle (worker + client + config + workflow + 19 tests verts) est **fait et poussé**.
Ici = ce qui reste, trié par priorité + ce que JE peux faire vs le clic Kevin.

> 📌 **MAJ 14/08/2026 — les 9 NOUVEAUX paliers gratuits** (Cerebras, Nvidia,
> SambaNova, Hugging Face, Nebius, Scaleway, GLM, Qwen, Perplexity) sont listés
> avec leurs liens 1 clic dans **[KEVIN_ACTIONS_TODO.md, section 2](KEVIN_ACTIONS_TODO.md)**
> — c'est LA liste à jour. Ce fichier-ci ne couvre que les clés d'avant, pour
> ne pas avoir deux listes qui se contredisent.

---

## 🔴 Priorité 1 — activer la passerelle (1 clic Kevin puis auto)

- [ ] **Kevin** : merger la branche `claude/free-apis-analysis-c4sy5d` sur `main`
  (bouton *Create PR* → *Merge*, ou workflow `auto-merge-claude.yml`).
- [ ] **Auto** : au merge, `deploy-kdmc-apis.yml` déploie le worker + pose les clés
  déjà présentes (GEMINI, GROQ, OPENROUTER, MISTRAL, COHERE, DEEPSEEK, TOGETHER, XAI,
  TAVILY, PEXELS, FINNHUB, PRINTIFY) et smoke-teste `/health`.
- [ ] **Vérif** : ouvrir `https://apis.kd-mc.com/health` → doit lister les clés chargées.
  (Le custom_domain peut mettre ~1 min à provisionner DNS+SSL au 1er déploiement.)

## 🟠 Priorité 2 — clés gratuites à ajouter (Secrets GitHub, noms EXACTS)

À coller dans *Settings → Secrets → Actions*. Aucune CB. Le worker les prend auto au prochain deploy.

- [ ] `BRAVE_API_KEY` — [console Brave Search](https://brave.com/search/api/) (2 000 req/mois) → failover recherche.
- [ ] `RESEND_API_KEY` — [Resend](https://resend.com/api-keys) (3 000 mails/mois) → emails propres.
- [ ] (option) `HF_TOKEN` — [HuggingFace](https://huggingface.co/settings/tokens) → transcription/sous-titres Social Video.
- [ ] (option) confirmer que `CEREBRAS`/`GEMINI` free tiers sont OK (déjà couverts par la chaîne IA).

> Les clés déjà présentes n'ont RIEN à refaire. Ci-dessus = seulement les nouvelles.

## 🟡 Priorité 3 — câblage par app (JE le fais, app par app, sur demande)

Chaque app charge `/CMCteams/tools/shared/free-apis-client.js` puis appelle `KdmcApis.*`.

- [ ] **CMCteams** : `KdmcApis.holidays()` → auto FL/CFL dans le planning · `KdmcApis.weather()` affluence · `KdmcApis.geoip()` log login · `KdmcApis.pwned()` refuser PIN fuité.
- [ ] **Apex AI** : `KdmcApis.ai()` en failover · `search()` · `fx()` · `finance()` · `translate()`.
- [ ] **Apex Chat** : `translate()` messages · `pwned()` à l'inscription.
- [ ] **Chez Lolo / Shops** : `fx()` prix €↔$ · `printify()` blueprints (résout le TODO catalogue) · `images()`.
- [ ] **Portail / dashboard kd-mc.com** : `health()` page d'état des apps · `pwned()`.

## 🟢 Priorité 4 — extensions passerelle keyless

- [x] `/entreprise` — [Recherche d'entreprises gouv.fr](https://recherche-entreprises.api.gouv.fr/docs/) ✅ FAIT
- [x] `/adresse` — [Base Adresse Nationale](https://adresse.data.gouv.fr/api-doc/adresse) ✅ FAIT
- [x] `/iban` — [openiban.com](https://openiban.com/) ✅ FAIT
- [x] `/vat` — [VIES](https://ec.europa.eu/taxation_customs/vies/) ✅ FAIT
- [x] `/crypto` — [CoinGecko keyless](https://www.coingecko.com/learn/best-free-crypto-api) ✅ FAIT
- [x] `/reputation` — Google Safe Browsing (clé `GOOGLE_API_KEY` déjà en secret) ✅ FAIT
- [x] `/rss` — proxy RSS **allowlist anti-SSRF** (`RSS_ALLOW`) ✅ FAIT

## 🖱️ Page 1-clic pour les clés
- [x] `tools/shared/free-apis-keys.html` — boutons directs + copie du nom de secret EXACT +
  lien Secrets GitHub. Sur le domaine : `https://cmcteams.kd-mc.com/CMCteams/tools/shared/free-apis-keys.html`

## 🆓 Solution comptes providers / KYC (répondu 2026-07-04)

**Aucune de ces APIs gratuites ne demande de KYC** (le KYC = bancaire : Stripe/banque, pas ici).
Trois niveaux, du + autonome au + de friction :

1. **0 compte, 0 clé, 0 KYC** — toutes les routes `public` (météo, jours fériés, taux, géo,
   adresse, entreprise, IBAN, TVA, crypto, traduction, wiki, pwned). Déjà en place, marchent seules.
2. **0 compte provider, 0 KYC — IA incluse** — `/ai` bascule sur **Cloudflare Workers AI**
   (ton compte Cloudflare existant, binding `env.AI`). L'IA répond même sans une seule clé externe.
3. **Signup email uniquement (pas de KYC, pas de CB)** — pour Gemini/Groq/OpenRouter/Cohere/
   Mistral/Brave/Resend : juste un email + copier la clé (1 fois). Aucune vérification d'identité.
   → JE prépare les liens 1-clic ; TOI tu colles la clé dans les Secrets. C'est le seul geste manuel.

## 🔵 Priorité 5 — mesure & robustesse

- [ ] **KPI/analytics** (cookieless, RGPD) : brancher **[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)** (gratuit, tu es déjà sur Cloudflare) OU **[Umami Cloud](https://umami.is/)** (1 M events/mois) sur chaque app → savoir ce qui est utilisé, 0 cookie.
- [ ] **Uptime** : ajouter `kdmc-apis` + les apps à `external-apis-health.yml` (déjà en place, cron 6h).
- [ ] **Rate-limit durable** : si abus, ajouter un KV au worker (aujourd'hui best-effort via quotas upstream).

## ⚪ Idées "va plus loin" (à valider avant de coder)

- [ ] **Live data** : SSE Wikimedia (recent changes), F1 (Monaco GP) via ergast/openf1, cours Yahoo Finance WS.
- [ ] **IoT/domotique** : Home Assistant (secrets déjà là : HOME_ASSISTANT_URL/TOKEN), Broadlink.
- [ ] **MCP à exploiter dans Apex** (déjà connectés, 0 clé) : GitHub, Malwarebytes, Legal Data Hunter, Microsoft Learn, Context7, nanobanana (image IA), Shopify, Supabase, Figma/Canva/Gamma, ICD-10.
- [ ] **Supabase** (Postgres gratuit) : base partagée domaine pour audit/logs cross-app.

---

### Ce qui est FAIT (vérifié)
- ✅ Worker `services/kdmc-apis/worker.js` + `wrangler.toml` (route `apis.kd-mc.com`).
- ✅ 19 tests unitaires verts (`worker.test.mjs`) + `node --check`.
- ✅ Client `tools/shared/free-apis-client.js` + config `free-apis-config.json`.
- ✅ Workflow `deploy-kdmc-apis.yml` (secrets présents seulement, smoke `/health`).
- ✅ Commit `3c27e28` poussé + vérifié sur GitHub.

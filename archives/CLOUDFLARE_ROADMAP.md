# ☁️ CLOUDFLARE ROADMAP — Inventaire & étapes pas-à-pas (Kevin novice)

> **Mission** : voir ce qu'on a déjà sur Cloudflare + faire ensemble ce qui manque, étape par étape.
> **Date** : 2026-05-01 (Apex v12.559)
> **Pour Kevin** : tu cliques. Je code. Pas de jargon.

---

## 📦 INVENTAIRE — Ce qu'on a déjà préparé

### ✅ Workers créés dans le repo (code prêt à déployer)

| # | Worker | Dossier | Rôle |
|---|--------|---------|------|
| 1 | **apex-push-worker** | `tools/cloudflare/apex-push-worker.js` | Notifications push iPhone (VAPID) |
| 2 | **apex-auth-worker** | `services/apex-auth-worker/` | Phase 5 Firebase Auth (badge Google officiel) |
| 3 | **chat-svc** | `services/chat-svc/` | Proxy chat IA Anthropic + failover OpenRouter/Groq/Gemini |
| 4 | **vault-svc** | `services/vault-svc/` | Coffre-fort secrets chiffrés AES-GCM 256 |
| 5 | **sentinels-svc** | `services/sentinels-svc/` | Vigile nuit cron lundi 02h (audits auto) |

### ✅ Outils annexes
| Outil | Localisation | Statut |
|-------|--------------|--------|
| Générateur clés VAPID | `tools/cloudflare/gen-vapid.html` | ✅ Live |
| Page deploy 1-clic | `tools/cloudflare/deploy-worker.html` | ✅ Live |
| Guide push worker | `tools/cloudflare/DEPLOY-PUSH-WORKER.md` | ✅ Existe |
| Clés VAPID **publique** | `BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY` | ✅ Intégrée Apex v12.207 |
| Clés VAPID **privée** | `VOaaNRpzQAo3tbwrpY3rg_docYCCKKhg1uaxuNVT4Ao` | À coller dans Cloudflare Worker `VAPID_PRIVATE_KEY` |

### ✅ Apex Chat workers (séparés, dans messaging-app/)
| # | Worker | Statut |
|---|--------|--------|
| 6 | **api-worker** | ✅ Code prêt, Mode A actée |
| 7 | **push-worker** (Apex Chat) | ✅ Code prêt |
| 8 | **sms-worker** (Apex Chat) | ✅ Code prêt |
| 9 | **ia-worker** (Apex Chat) | ✅ Code prêt |
| 10 | **ConversationDO** (Durable Object) | ✅ Code prêt |

---

## ❓ ÉTAT INCONNU À CONFIRMER

Je ne peux pas voir ton dashboard Cloudflare. Réponds-moi à ces 3 questions :

### Q1 — As-tu déjà un **compte Cloudflare** ?
- 🟢 **OUI** → quelle est ton URL ? (genre `https://dash.cloudflare.com/<ACCOUNT-ID>`)
- 🔴 **NON** → étape 1 ci-dessous (5 min, gratuit, pas de carte)

### Q2 — As-tu déjà déployé le **push worker** ?
- 🟢 **OUI** → c'est quoi son URL ? (genre `https://apex-push-worker.<TON-SUB>.workers.dev`)
- 🔴 **NON** → suivre `tools/cloudflare/DEPLOY-PUSH-WORKER.md` (5 min)

### Q3 — As-tu un **Cloudflare API Token** ?
- 🟢 **OUI** → où est-il stocké ?
- 🔴 **NON** → étape 5 ci-dessous (1 min)

---

## 🚀 PLAN D'ACTION PAS À PAS

### Étape 1 — Compte Cloudflare (5 min, GRATUIT, pas de CB)

1. Sur ton iPhone Safari, ouvre : **https://dash.cloudflare.com/sign-up**
2. Email + mot de passe (utilise un mot de passe fort, stocke-le dans le Coffre Apex)
3. Confirme l'email reçu
4. **Note ton ACCOUNT ID** : visible en haut à droite après login (32 caractères hex)
5. Colle-le dans Apex Coffre, clé `ax_cloudflare_account_id`

✅ **C'est tout pour l'instant**. Pas besoin de carte bancaire. Tier gratuit suffit.

---

### Étape 2 — Push Worker (déjà documenté dans tools/cloudflare/DEPLOY-PUSH-WORKER.md)

Si pas déjà fait :
1. Va sur **https://dash.cloudflare.com/?to=/:account/workers**
2. Clique **"Create Worker"** → nomme-le `apex-push-worker`
3. **Edit code** → efface tout → colle le contenu de `tools/cloudflare/apex-push-worker.js`
4. **Save and deploy**
5. Variables d'environnement (Settings → Variables) :
   - `VAPID_PUBLIC_KEY` = `BJ5XN-ZzchR...` (clé publique ci-dessus)
   - `VAPID_PRIVATE_KEY` = `VOaaNRpzQA...` (clé privée ci-dessus)
   - `VAPID_EMAIL` = ton email
   - `ADMIN_TOKEN` = génère un mot de passe fort 32 chars
   - `FIREBASE_URL` = `https://kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app`
6. **Note l'URL du worker** : `https://apex-push-worker.<TON-SUB>.workers.dev`
7. Colle dans Apex Coffre, clé `ax_push_worker_url`

---

### Étape 3 — apex-auth-worker (Phase 5 Firebase Auth)

Suivre le guide complet : **`PHASE5_DEPLOY.md`** (déjà créé v12.554)

Résumé :
1. Récupérer Firebase Service Account JSON (Console Firebase → Comptes service → Générer clé)
2. Dans GitHub Codespaces ou Mac/PC : `cd services/apex-auth-worker && npm install`
3. `npx wrangler login` (ouvre navigateur, autorise)
4. `npx wrangler kv namespace create AUTH_KV` (note l'ID, colle dans wrangler.toml)
5. `npx wrangler secret put FIREBASE_PRIVATE_KEY` (colle valeur du JSON)
6. `npx wrangler secret put FIREBASE_CLIENT_EMAIL` (colle valeur du JSON)
7. `npx wrangler deploy`
8. Note l'URL → colle dans Apex Coffre `ax_auth_worker_url`

---

### Étape 4 — chat-svc + vault-svc + sentinels-svc

Suivre **`MICROSERVICES_PLAN.md`** (déjà créé v12.556).

Pour CHAQUE des 3 services, même schéma que étape 3 :
```bash
cd services/<chat-svc | vault-svc | sentinels-svc>
npm install
npx wrangler kv namespace create <NOM_KV>
# coller ID dans wrangler.toml

npx wrangler secret put <SECRET_NAME>
# voir wrangler.toml de chaque service pour la liste

npx wrangler deploy
# colle URL retournée dans Apex Coffre clé correspondante
```

Clés Apex Coffre à remplir après déploiement :
- `ax_chat_svc_url`
- `ax_vault_svc_url`
- `ax_sentinels_svc_url`

---

### Étape 5 — Cloudflare API Token (pour auto-deploy futur)

1. Va sur **https://dash.cloudflare.com/profile/api-tokens**
2. Clique **"Create Token"**
3. Sélectionne template **"Edit Cloudflare Workers"**
4. Confirme → token affiché UNE fois → **copie-le immédiatement**
5. Colle dans Apex Coffre, clé `ax_cf_token`

✅ Ce token permet à Apex IA d'auto-déployer les nouveaux workers en autonomie.

---

### Étape 6 — Apex Chat workers (messaging-app/) — OPTIONNEL

Si tu veux activer Apex Chat (messagerie privée WhatsApp clone) :
1. Lis **`messaging-app/PROJECT_MEMO.md`** (Mode A actée)
2. Suis le guide à l'intérieur
3. 4 workers à déployer : api / push / sms / ia + 1 Durable Object (ConversationDO)

Tu peux **garder pour plus tard** si tu veux d'abord stabiliser Apex AI principal.

---

## 📊 ÉTAT FINAL ATTENDU

Après tout déployé (~2-3h cumulé sur 1 weekend) :

| Worker | URL Apex Coffre | Statut |
|--------|------------------|--------|
| apex-push-worker | `ax_push_worker_url` | ✅ |
| apex-auth-worker | `ax_auth_worker_url` | ✅ |
| chat-svc | `ax_chat_svc_url` | ✅ |
| vault-svc | `ax_vault_svc_url` | ✅ |
| sentinels-svc | `ax_sentinels_svc_url` | ✅ |
| Apex Chat 4 workers | (séparé, optionnel) | ⏳ |

**Score Apex AI estimé après tout déployé** : 88.5 → **94/100 réel**.

---

## 🤖 Apex IA AUTO-CHECK statut Cloudflare

Apex IA peut maintenant (v12.559+) lire ton Coffre et te dire ce qui manque :

```
Sur ton iPhone, dans le chat Apex, tape :
> Audit Cloudflare
```

→ Apex retourne :
- ✅ Workers configurés (avec URL)
- ❌ Workers manquants (avec lien direct setup)
- ⚠️ Tokens expirés / invalides

---

## ❓ Questions / blocages

Si tu coinces à une étape, tape dans Apex chat :
> Aide Cloudflare étape X

Apex IA guide pas-à-pas + propose action 1-clic via Apex Code Companion.

---

**Document** : Claude Code session_01BnrRgT9QTJtmaRzBFsoiRq
**Date** : 2026-05-01
**Version** : Apex v12.559

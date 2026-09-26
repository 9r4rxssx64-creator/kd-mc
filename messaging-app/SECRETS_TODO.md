# 🔐 Apex Chat — Secrets GitHub à configurer

> **Centralise TOUS tes secrets ici. Plus jamais perdus, plus jamais à recopier.**
> Réutilisables par Apex + CMCteams + Apex Chat (cross-app).
>
> **URL** : [github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions](https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions)

---

## 📋 Procédure (30 secondes par secret)

1. Ouvre l'URL ci-dessus dans Safari iPhone
2. Touche **"New repository secret"** (gros bouton vert)
3. **Name** : copie EXACTEMENT le nom de la liste (sensible casse, sans guillemets)
4. **Secret** : colle la valeur (sans espaces avant/après)
5. Touche **"Add secret"**
6. Reviens ici et dis-moi "fait <NOM>" → je vérifie + passe au suivant

---

## 🏆 NIVEAU 1 — Essentiels (à faire en priorité)

### ☁️ `CLOUDFLARE_API_TOKEN`
- **Status** : 🟡 En cours (token précédent à révoquer + remettre nouveau)
- **Où récupérer** : [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → Roll ton token actuel → Copy
- **Pour** : Déploiement workers Apex Chat + Apex push

### 🤖 `ANTHROPIC_API_KEY`
- **Status** : ⚪ À ajouter
- **Où récupérer** : [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) → Create Key
- **Format** : `sk-ant-api03-...`
- **Pour** : IA Claude (chat assistant Apex Chat + Apex)
- **Coût** : Pay-as-you-go (~5-20€/mois usage normal)

### 🌐 `FIREBASE_API_KEY`
- **Status** : ⚪ À ajouter
- **Où récupérer** : [console.firebase.google.com](https://console.firebase.google.com) → projet `cmcteams-c16ab` → ⚙️ Project settings → Your apps → Web → Config → `apiKey`
- **Format** : `AIzaSy...`
- **Pour** : Auth Phone (SMS) + RTDB

---

## 🔄 NIVEAU 2 — Failover IA (recommandés)

### 🚀 `GROQ_API_KEY` (gratuit, ultra-rapide)
- **Où récupérer** : [console.groq.com/keys](https://console.groq.com/keys) → Create API Key
- **Format** : `gsk_...`
- **Pour** : Failover IA gratuit (Llama 3.3 70B, plus rapide qu'Anthropic)
- **Coût** : Gratuit jusqu'à 14 400 requêtes/jour

### 🧠 `GEMINI_API_KEY` (gratuit limité)
- **Où récupérer** : [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API Key
- **Format** : `AIzaSy...`
- **Pour** : Failover IA Google
- **Coût** : Gratuit 1500 req/jour Flash, payant ensuite

### 🔀 `OPENROUTER_API_KEY` (router multi-modèles)
- **Où récupérer** : [openrouter.ai/keys](https://openrouter.ai/keys) → Create Key
- **Format** : `sk-or-v1-...`
- **Pour** : Accès unifié Claude/Gemini/Llama via 1 seule clé
- **Coût** : Marge ~5% sur prix providers

### 🎯 `OPENAI_API_KEY` (dernier recours)
- **Où récupérer** : [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new secret key
- **Format** : `sk-proj-...`
- **Pour** : Fallback ultime (GPT-4o-mini)
- **Coût** : Pay-as-you-go

---

## 📲 NIVEAU 3 — Communications

### 📨 `VONAGE_API_KEY` + `VONAGE_API_SECRET`
- **Où récupérer** : [dashboard.nexmo.com/getting-started/sms](https://dashboard.nexmo.com/getting-started/sms) → API key + secret en haut
- **Pour** : SMS invitations Apex Chat (gratuit jusqu'à 2€ crédit)
- **Coût** : ~0,0075€/SMS Europe

### 🔔 `VAPID_PRIVATE_KEY`
- **Status** : 🟡 Existe déjà côté push-worker Apex (à récupérer)
- **Où récupérer** : Demande-moi de te générer la commande pour le récupérer du worker existant
- **Pour** : Web Push notifications cross-platform

### 📞 `TELEGRAM_BOT_TOKEN`
- **Status** : 🟡 Existe peut-être déjà
- **Où récupérer** : Telegram → @BotFather → /token → choisis `Kdmc_kevind_2026_bot`
- **Format** : `1234567890:ABC-DEF...`
- **Pour** : Bot Telegram Apex existant

### 📧 `EMAILJS_PUBLIC_KEY` + `EMAILJS_SERVICE_ID` + `EMAILJS_TEMPLATE_ID`
- **Où récupérer** : [dashboard.emailjs.com](https://dashboard.emailjs.com)
- **Pour** : Envoi emails Apex (déjà configuré Gmail + Outlook + iCloud)

---

## 💰 NIVEAU 4 — Paiements (Phase 9)

### 💳 `STRIPE_SECRET_KEY`
- **Status** : 🟡 KYC à faire d'abord
- **Où récupérer** : [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) → Secret key
- **Format** : `sk_live_...` (production) ou `sk_test_...` (dev)
- **Pour** : Apex Chat+ Premium 6,99€/mois + Lifetime 199€
- **Action requise** : Compléter KYC Stripe (pièce ID + RIB)

### 🪝 `STRIPE_WEBHOOK_SECRET`
- **Où récupérer** : Stripe Dashboard → Developers → Webhooks → Endpoint → Signing secret
- **Format** : `whsec_...`
- **Pour** : Validation événements paiement

### 💸 `PAYPAL_ME_USERNAME`
- **Où récupérer** : Ton username PayPal.me (sans le @)
- **Pour** : Paiement QR P2P Apex Chat

### 🏦 `REVOLUT_TAG`
- **Format** : Sans le @ (ex: `kdmc`)
- **Pour** : Paiement QR P2P Apex Chat

### 💼 `IBAN_KEVIN`
- **Format** : `FR76...`
- **Pour** : Virement SEPA dans Apex Chat

---

## 📊 NIVEAU 5 — Monitoring & API tierces

### 🐛 `SENTRY_DSN`
- **Où récupérer** : [sentry.io](https://sentry.io) → projet → Settings → Client Keys (DSN)
- **Pour** : Capture erreurs Apex + CMCteams + Apex Chat

### 📈 `FINNHUB_API_KEY`
- **Où récupérer** : [finnhub.io/dashboard](https://finnhub.io/dashboard)
- **Pour** : Cours bourse Apex

### 🌤 `OPENWEATHER_API_KEY` (optionnel)
- **Où récupérer** : [home.openweathermap.org/api_keys](https://home.openweathermap.org/api_keys)
- **Pour** : Météo Apex (sinon open-meteo gratuit suffit)

### 🏠 `HOME_ASSISTANT_URL` + `HOME_ASSISTANT_TOKEN`
- **Où récupérer** : Ton interface Home Assistant locale → Profile → Long-lived access tokens
- **Pour** : Domotique Apex

### 📺 `BROADLINK_API_KEY`
- **Pour** : Domotique IR (42 commandes pré-configurées Apex)

---

## 🤖 NIVEAU 6 — Auto-générés (NE PAS toucher, je m'en occupe)

Ces secrets sont **générés automatiquement** par le workflow GitHub Actions à chaque déploiement Apex Chat :

- `JWT_SIGN_KEY` (auto, 64 chars random)
- `APEX_CHAT_ADMIN_TOKEN` (auto, 32 chars random)
- `APEX_HANDOFF_TOKEN` (auto, 32 chars random)

**Ne les ajoute pas manuellement** — c'est moi qui les crée à la volée.

---

## 📝 Progression — Coche au fur et à mesure

### Essentiels
- [ ] `CLOUDFLARE_API_TOKEN` (rolled après partage chat)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `FIREBASE_API_KEY`

### Failover IA
- [ ] `GROQ_API_KEY` ⭐ recommandé en premier (gratuit)
- [ ] `GEMINI_API_KEY`
- [ ] `OPENROUTER_API_KEY`
- [ ] `OPENAI_API_KEY`

### Communications
- [ ] `VONAGE_API_KEY`
- [ ] `VONAGE_API_SECRET`
- [ ] `VAPID_PRIVATE_KEY` (récupéré du worker existant)
- [ ] `TELEGRAM_BOT_TOKEN`
- [ ] `EMAILJS_PUBLIC_KEY`
- [ ] `EMAILJS_SERVICE_ID`
- [ ] `EMAILJS_TEMPLATE_ID`

### Paiements
- [ ] `STRIPE_SECRET_KEY` (après KYC)
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `PAYPAL_ME_USERNAME`
- [ ] `REVOLUT_TAG`
- [ ] `IBAN_KEVIN`

### Monitoring
- [ ] `SENTRY_DSN`
- [ ] `FINNHUB_API_KEY`
- [ ] `OPENWEATHER_API_KEY`
- [ ] `HOME_ASSISTANT_URL`
- [ ] `HOME_ASSISTANT_TOKEN`
- [ ] `BROADLINK_API_KEY`

---

## ⚡ Quand tu ajoutes un secret

Reviens ici et dis-moi simplement le nom : **"fait ANTHROPIC_API_KEY"**

Je vais :
1. ✅ Vérifier qu'il est bien en place
2. ✅ Mettre à jour le workflow `deploy-apex-chat.yml` pour l'utiliser
3. ✅ Préparer un workflow `sync-secrets-to-apex.yml` qui propage automatiquement vers Apex + CMCteams
4. ✅ Te dire le suivant à faire selon la priorité

---

## 🛡 Sécurité

- **GitHub Secrets** sont chiffrés AES-256 + libsodium (impossible à lire même par GitHub)
- Une fois ajoutés, **invisibles** dans l'UI (juste le nom)
- **Audit log** : tu peux voir qui a accédé/modifié dans Settings → Audit log
- **2FA obligatoire** sur ton compte GitHub recommandée (Settings → Password and authentication)
- **Aucun workflow** ne peut leak un secret dans les logs (GitHub les masque automatiquement par `***`)

---

## 🎬 OPTIONNEL — `GIPHY_KEY` (pour envoyer des GIF, gratuit)

### 🎬 `GIPHY_KEY`
- **Status** : ⚪ À ajouter (optionnel — sans lui, le bouton GIF affiche « pas encore activé »)
- **Où récupérer (gratuit, 2 min)** :
  1. [developers.giphy.com/dashboard](https://developers.giphy.com/dashboard/) → **Create an App**
  2. Choisis **"API"** (pas "SDK") → donne un nom (ex "Apex Chat") → **Create App**
  3. Copie la clé **"API Key"** affichée
- **Pour** : activer le sélecteur de GIF (recherche Giphy). La clé reste **secrète côté serveur** (jamais dans l'app). Une fois le secret ajouté, le déploiement l'active tout seul.
- **Alternative** : Tenor (Google) — [developers.google.com/tenor/guides/quickstart](https://developers.google.com/tenor/guides/quickstart) (nécessite un projet Google Cloud, un peu plus long). Dis-moi si tu préfères Tenor, je bascule le proxy.

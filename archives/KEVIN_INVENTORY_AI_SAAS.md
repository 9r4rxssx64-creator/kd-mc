# 🧠 Inventaire Apex — IA + SaaS — Priorité GRATUIT performant

**Mise à jour** : 2026-05-04 v13.0.18  
**Règle Kevin** : priorité gratuits sans limite gênante. Anthropic toujours OP en priorité.

---

## 🟢 CE QUE TU AS DÉJÀ (configurable Apex)

Apex reconnaît automatiquement 54 patterns. Quand tu colles une clé, elle est :
- Détectée par regex
- Chiffrée AES-GCM 256 (AXENC1: prefix)
- Stockée dans `ax_<service>_key`
- Auto-testée via endpoint
- Auto-link dashboard via links-registry

### IA — providers chat/completion

| Service | Pattern | Status | Free tier | Recommandation |
|---------|---------|--------|-----------|----------------|
| **Anthropic** | `sk-ant-api...` | 🔵 PRIORITÉ ABSOLUE | Pay-as-you-go (5$ start) | À garder TOUJOURS opérationnel |
| **OpenAI** | `sk-...` / `sk-proj-...` | Configurable | Free 5$ trial | Backup pour code complexe |
| **Groq** | `gsk_...` | Configurable | **Free 30 req/min, 6K tok/min** | ⭐ PRIORITAIRE GRATUIT (vitesse) |
| **Google Gemini** | `AIza...` | Configurable | **Free 15 req/min, 1M tok/jour** | ⭐ PRIORITAIRE GRATUIT (vision/longueur) |
| **OpenRouter** | `sk-or-...` | Configurable | Modèles gratuits (Llama, Mixtral) | ⭐ Failover gratuit |
| **Cohere** | `co_...` | Configurable | Free 100 req/min | Bon pour embeddings |
| **Mistral** | `...` | Configurable | Free tier limité | Backup EU |
| **DeepSeek** | `sk-...` | Configurable | $0.14/M tokens (très bon marché) | Code complexe |
| **Perplexity** | `pplx-...` | Configurable | 5$ free | Search citée |
| **xAI Grok** | `xai-...` | Configurable | Pay-as-you-go | Optionnel |

### Voice / Audio

| Service | Pattern | Free tier | Recommandation |
|---------|---------|-----------|----------------|
| **Web Speech API** | (natif) | **Illimité gratuit** | ⭐ PRIORITÉ TTS/STT iPhone |
| **ElevenLabs** | `...` | 10 min/mois free | Voice clone premium |
| **Replicate** | `r8_...` | Limité | Génération audio |

### Search

| Service | Pattern | Free tier | Recommandation |
|---------|---------|-----------|----------------|
| **DuckDuckGo HTML** | (sans clé) | **Illimité gratuit** | ⭐ PRIORITÉ ABSOLUE search |
| **Brave Search** | `BSA*` | 2000 req/mois | Backup search |
| **Tavily** | `tvly-...` | 1000 req/mois | AI-native search |
| **Google CSE** | `AIza...` | 100 req/jour | Optionnel |

### Email / Push / Comms

| Service | Pattern | Free tier | Recommandation |
|---------|---------|-----------|----------------|
| **Resend** | `re_...` | **Free 100/jour, 3K/mois** | ⭐ PRIORITÉ email transactionnel |
| **Brevo** | `xkeysib-...` | **Free 300/jour** | ⭐ Backup email |
| **Telegram Bot** | `...:...` | **Illimité gratuit** | ⭐ Notifs Kevin admin |
| **EmailJS** | (natif client) | 200/mois free | Form submissions |
| **Cloudflare Push Worker** | (custom) | **100K req/jour free** | ⭐ Notifs PWA app fermée |

### Paiement / Finance

| Service | Pattern | Free tier | Recommandation |
|---------|---------|-----------|----------------|
| **Stripe** | `sk_/pk_/rk_*` | Pay-as-you-go (1.4% + 0.25€) | Quand Apex commercialisé |
| **Finnhub** | `...` | Free 60 req/min | Stocks/forex |
| **CoinGecko** | (sans clé) | **Illimité gratuit** | ⭐ Crypto prices |

### Dev / Hosting

| Service | Pattern | Free tier | Recommandation |
|---------|---------|-----------|----------------|
| **GitHub PAT** | `ghp_/github_pat_...` | **Free illimité** | ⭐ Repos + Actions |
| **Cloudflare Workers** | API token | **100K req/jour free** | ⭐ Backend serverless |
| **Vercel** | `...` | Free hobby | Frontend deploy alt |
| **Netlify** | `...` | Free 100GB/mois | Frontend deploy alt |

### Météo / Données publiques

| Service | URL | Free tier |
|---------|-----|-----------|
| **Open-Meteo** | open-meteo.com | **Illimité gratuit** ⭐ |
| **Wikipedia API** | wikipedia.org/api/rest_v1 | **Illimité gratuit** ⭐ |
| **NASA APOD** | api.nasa.gov | 1000 req/heure |

---

## 🌟 CE QUI SERAIT UTILE (à ajouter si pas déjà fait)

### Priorité 1 — IA Gratuites Sans Limite Pratique

**🥇 Groq** (Llama 3.3 70B, Mixtral, Whisper)
- Inscription : https://console.groq.com (Google login OK)
- Récupère clé `gsk_*` → colle dans Apex
- Vitesse : 500+ tokens/sec (le plus rapide du marché)
- Free : 30 req/min, 6000 tokens/min
- Apex auto-route les questions rapides ici quand activé

**🥇 Google Gemini 2.0 Flash** (très généreux)
- Inscription : https://aistudio.google.com/app/apikey
- Récupère clé `AIza*` → colle dans Apex
- Free : 15 req/min, 1500 req/jour, **1 million de tokens/jour**
- Excellent pour vision (image analysis) et long context (1M tokens)
- Apex auto-route les longs documents ici

**🥇 OpenRouter** (failover universel)
- Inscription : https://openrouter.ai/sign-up
- Récupère clé `sk-or-*` → colle dans Apex
- Modèles gratuits : Llama 3.3, Mixtral, Phi-3, Gemma
- Idéal failover quand Anthropic atteint quota

### Priorité 2 — SaaS Gratuits Performants

**🥇 Cloudflare Workers AI** (gratuit + edge)
- https://dash.cloudflare.com/workers-ai
- Free : 10K requêtes/jour
- Llama 3, Mistral, Whisper, Stable Diffusion
- 0ms latence (edge global)

**🥇 Telegram Bot** (notifs perso)
- @BotFather → /newbot → token format `123456:ABC*`
- Apex peut t'envoyer notifs critiques sans Apple Push
- Gratuit illimité, marche partout

**🥇 Resend** (email transactionnel)
- Inscription : https://resend.com/signup
- Récupère clé `re_*`
- Free : 100 emails/jour, 3000/mois
- Largement assez pour Apex perso + petits clients

### Priorité 3 — Optionnels (si besoin futur)

| Service | Quand l'ajouter | URL inscription |
|---------|-----------------|-----------------|
| **Stripe** | Quand tu commercialises Apex | https://dashboard.stripe.com/register |
| **ElevenLabs** | Voix premium clonée | https://elevenlabs.io/sign-up |
| **Replicate** | Génération vidéo/image | https://replicate.com/signin |
| **Supabase** | Backend alt Firebase | https://supabase.com/dashboard |
| **HuggingFace** | Modèles open-source | https://huggingface.co/join |

---

## 🎯 STRATÉGIE ROUTING IA (auto par Apex selon demande)

### Règles automatiques (services/ai-routing-policy.ts)

```
1. ANTHROPIC = PRIORITÉ ABSOLUE par défaut
   - Si Anthropic OK + budget < 80% → utilise Anthropic Sonnet 4.6
   - Tâches admin, sécurité, raisonnement complexe → TOUJOURS Anthropic

2. FREE FIRST pour tâches simples
   - Question courte (< 100 mots) → Groq Llama 3.3 70B (gratuit, rapide)
   - Long document (> 5000 tokens) → Gemini 2.0 Flash (1M context gratuit)
   - Résumé/traduction simple → Gemini ou Groq

3. DOMAIN ROUTING intelligent
   - Code/programmation → DeepSeek Coder ($) OU Claude (priorité)
   - Vision/image analysis → Gemini Flash (gratuit + bon)
   - Search/citations → Perplexity OU DDG + Anthropic
   - Speed critique → Groq (500+ tok/sec)

4. FAILOVER CHAIN si Anthropic down/quota
   - Anthropic → OpenRouter (Llama gratuit) → Gemini Flash → Groq → OpenAI

5. ADMIN OVERRIDE
   - Kevin peut forcer un provider via vSettings.preferredProvider
   - Mode "Économique" → free first toujours
   - Mode "Premium" → Anthropic Opus toujours
   - Mode "Auto" (default) → règles ci-dessus
```

### Quand Anthropic atteint 80% budget

Apex passe automatiquement en mode "économique" :
- Tâches simples → Gemini Flash gratuit
- Failover Groq pour speed
- Anthropic gardé en réserve pour Kevin admin urgent
- Notif push 1-clic recharge avec lien direct billing Anthropic

### Mode urgence (Anthropic = 100%)

- Apex utilise Gemini Flash gratuit (1M tokens/jour)
- Failover Groq Llama 3.3 70B (gratuit 30/min)
- Notif critique Kevin → 1-clic recharge Anthropic
- Aucun blocage utilisateur

---

## 💰 COÛT PRÉVISIBLE Apex 100 utilisateurs/mois

Avec stratégie free-first + Anthropic priority :

| Service | Free covers | Coût si dépassement |
|---------|-------------|---------------------|
| Anthropic Sonnet 4.6 | - | ~30€/mois (admin only + critique) |
| Groq Llama (rapide) | 90% requêtes | 0€ |
| Gemini Flash (vision/long) | 95% vision | 0€ |
| OpenRouter free Llama | 100% backup | 0€ |
| DDG Search | 100% | 0€ |
| Resend email | 100% (3K/mois) | 0€ |
| Cloudflare Workers | 100% (100K/jour) | 0€ |

**Coût total estimé : 30-50€/mois pour 100 utilisateurs actifs.**

---

## 📋 TON PROCHAIN PAS

1. **Maintenant** : tu peux coller tes 7 clés API (Anthropic + OpenAI + Stripe + Brevo + Resend + Gemini + GitHub PAT) — toutes chiffrées AES-GCM-256.
2. **5 min** : inscription Groq (lien + token + paste = gratuit + vitesse)
3. **5 min** : inscription Gemini AI Studio (gratuit 1M/jour)
4. **5 min** : déploiement Cloudflare Worker push (cf KEVIN_PUSH_DEPLOY_GUIDE.md)
5. **Optionnel** : OpenRouter (failover universel gratuit)

Apex auto-route ensuite selon règles + notifie 1-clic recharge si quota.

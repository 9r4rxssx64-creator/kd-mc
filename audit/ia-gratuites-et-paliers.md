# 🆓 Tout ce qui est gratuit et utile — le tri, pas le catalogue

> Kevin 2026-09-03 : *« Récupère tout d'utile chez free-for.dev. Et toutes les IA gratuites
> les plus performantes. »*
>
> Les deux catalogues sont maintenant **dans le dépôt, hors ligne** :
> `vendor/agent-toolkit/free-for-dev/README.md` (57 rubriques) et
> `vendor/agent-toolkit/free-llm-api-resources/README.md` (26 fournisseurs d'IA).
> Ce document-ci n'est pas une copie : c'est **le tri fait pour ta situation**,
> avec ce qui est **déjà branché**, ce qui **dort**, et ce qui vaut un clic.

---

## ⏭ À FAIRE PLUS TARD — la fiche, pour ne rien chercher le jour venu

> Noté le 3.09.2026 à la demande de Kevin (« note les IA pour plus tard »).
> Tout est prêt côté code : **il n'y a QUE la clé à poser**, rien à développer.

### ✅ Vérifié le 3.09 sur tes vraies pages de secrets (captures de Kevin, 00h58)

**50 secrets présents.** La contradiction que j'avais signalée est tranchée :

- **`CEREBRAS_API_KEY` EXISTE déjà** (posée il y a 2 mois). La liste de `CLAUDE.md`
  était périmée, la note de mémoire avait raison. → **Aucun compte Cerebras à créer.**
  Elle entrera en service toute seule au prochain déploiement.
- **`BINANCE_*` : bien supprimées.** La réponse au support GitHub est donc exacte sur
  son point 2 — vérifié, pas supposé.

**Bilan réel : 10 moteurs de texte sur 18 ont leur clé** — groq, gemini, mistral, cohere,
together, deepseek, xai, perplexity, **cerebras**, openai (payant, en dernier).

### Il ne reste que DEUX comptes à créer

| Nom du secret — **exact, à la lettre** | Où créer le compte | Ce que ça apporte |
|---|---|---|
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai/models?q=free) | DeepSeek R1 + V3, Llama, Moonshot — plusieurs gros modèles avec UNE clé |
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com/explore/discover) | beaucoup de modèles, palier large |

*(Piste bonus, sans nouveau compte : tu as déjà `VERCEL_TOKEN` — le Vercel AI Gateway
offre 5 $/mois. Non branché aujourd'hui, à évaluer.)*

**Où les poser** : GitHub → dépôt → Settings → Secrets and variables → **Actions** →
*New repository secret*. Le nom doit être **exact** : une faute et la clé ne sert à rien,
sans aucun message d'erreur.

### Ce qui se passe ensuite — automatiquement

Vérifié le 3.09, ligne par ligne : le déploiement du worker reprend **les 18 clés** que lit
le code (une boucle `for N in …` + `wrangler secret put`). **Aucune clé orpheline.** Donc :
poser le secret suffit, la clé arrive dans l'IA au déploiement suivant, que **je** lance.

### Ce qui bloque aujourd'hui

Le déploiement passe par GitHub Actions (suspendu) et le worker vit sur le compte
Cloudflare verrouillé. **Les secrets peuvent être posés dès maintenant** (Kevin a encore
accès à cette page — il y a supprimé les clés Binance le 2.09), ils dormiront jusqu'à la
réouverture. Rien d'autre à faire.

### Six autres moteurs attendent aussi leur clé (même mécanisme)

`SAMBANOVA_API_KEY` · `HF_TOKEN` · `SCALEWAY_API_KEY` · `NEBIUS_API_KEY` ·
`GLM_API_KEY` · `DASHSCOPE_API_KEY` (Qwen d'Alibaba — **inutile désormais**, Qwen passe
par Cloudflare sans aucune clé depuis le 3.09).

---

## 1. Les IA gratuites — l'état RÉEL de tes moteurs

Ton worker déclare **18 moteurs de texte**. Confronté à tes vraies pages de secrets
(3.09, 00h58) : **10 ont leur clé, 8 n'en ont pas** — ces huit-là sont écrits dans le code
mais **n'ont jamais pu répondre une seule fois**. C'est le piège « déclaré ≠ branché ».

### ✅ Ce qui marche vraiment aujourd'hui

| Moteur | Ce qu'il vaut | Palier gratuit |
|---|---|---|
| **Cloudflare Workers AI** | **aucune clé, aucun compte** — le seul dans ce cas | 10 000 neurones/jour |
| **Groq** | le plus **rapide** du marché | généreux, par modèle |
| **Google AI Studio** (Gemini) | le plus **généreux** en volume | très large |
| **Mistral** | bon en français | palier Experiment |
| **Cohere** | solide en résumé/classement | limité mais réel |
| **Together** | Llama 3.3 70B gratuit | modèle `…-Free` |
| **Cerebras** | le plus **rapide** de tous — clé posée il y a 2 mois, jamais mise en service | généreux |
| **DeepSeek** · **xAI** · **Perplexity** | payants, en renfort | — |
| *OpenAI* | **filet payant, en tout dernier** | — |

Depuis aujourd'hui, **Qwen s'ajoute à cette liste sans aucune clé**, par Cloudflare.

### 💤 Ce qui dort dans ton code (déclaré, sans clé)

`openrouter` · `nvidia` · `sambanova` · `huggingface` · `scaleway` · `nebius` · `glm` ·
`qwen (Alibaba)` — **plus `cerebras`, qui a sa clé et n'attend que le déploiement.**

Ce ne sont **pas des bugs** : le code les ignore proprement. Mais tant qu'ils n'ont pas
de clé, ils ne servent à rien. **Deux valent vraiment le clic** (compte gratuit, sans carte) :

| À réveiller | Pourquoi celui-là | Où |
|---|---|---|
| **OpenRouter** ⭐ | donne accès **gratuitement** à DeepSeek R1, DeepSeek V3, Llama, Moonshot — plusieurs gros modèles d'un coup, avec une seule clé | [openrouter.ai](https://openrouter.ai/models?q=free) |
| **NVIDIA NIM** | beaucoup de modèles, palier gratuit large | [build.nvidia.com](https://build.nvidia.com/explore/discover) |

Le code les attend déjà : tu poses la clé, ils entrent dans la chaîne. Rien à coder.

### 🚫 Gratuits mais **inaccessibles pour toi en ce moment**

- **GitHub Models** — gratuit, mais exige un compte GitHub… suspendu. À revoir après.
- **Vercel AI Gateway** — 5 $/mois offerts. Tu as **déjà** `VERCEL_TOKEN` en secret : c'est
  donc une piste réelle, simplement pas encore branchée dans la chaîne. 🟡 à évaluer.
- **Gonka Broker** — 1 M de jetons gratuits/mois, compatible OpenAI. Jamais testé : 🔴 à essayer.

---

## 2. free-for.dev — seulement ce qui répond à un problème que tu as

### Remplacer les tâches programmées de GitHub (interdites chez nous)

| Service | Palier gratuit | Verdict |
|---|---|---|
| **GitLab CI (schedules)** | inclus | ✅ **tu l'as déjà** — c'est la bonne réponse |
| **Worker Cloudflare (cron)** | inclus | ✅ **tu l'as déjà** (quand le compte rouvre) |
| [cron-job.org](https://cron-job.org) | **tâches illimitées, gratuites** | 🥈 si tu veux un déclencheur hors de ton infra |
| [Val Town](https://www.val.town) | 15 min/jour | petits scripts + cron |

### Savoir qu'une tâche **n'a pas** tourné

[healthchecks.io](https://healthchecks.io) — **20 surveillances gratuites**. Le principe :
la tâche « fait signe » ; si elle se tait, tu es prévenu. C'est exactement ce qui a manqué
quand la publication du site s'est arrêtée sans que personne ne le voie.

### Si Cloudflare devait rester fermé (plan de repli honnête)

| Besoin | Solution gratuite | Limite réelle |
|---|---|---|
| Héberger les pages | [Netlify](https://www.netlify.com/) | 300 crédits/mois (~30 Go) |
| Faire tourner un service | [Koyeb](https://www.koyeb.com/) | 550 h/mois, 512 Mo |
| Base de données | [Neon](https://neon.tech/) (Postgres) · [Turso](https://turso.tech/) (SQLite) | 0,5 Go |
| Envoyer des mails | [Brevo](https://www.brevo.com/) 9 000/mois · [Resend](https://resend.com) 3 000/mois | — |
| Images / médias | [Cloudinary](https://cloudinary.com/) · [uploadcare](https://uploadcare.com/) · [sirv](https://sirv.com/) | 500 Mo à 25 Go |

⚠️ **Ce repli ne rend PAS `kd-mc.com`** : le nom de domaine est rattaché au compte
Cloudflare verrouillé. Il permettrait de remettre les apps en ligne **à une autre adresse**,
pas de récupérer la tienne. (Leçon #187 : un plan B qui dépend de ce qu'on a perdu n'en est pas un.)

---

## 3. Ce que j'ai fait, ce qui reste

**Fait** — les deux catalogues sont dans le dépôt, consultables hors ligne et cherchables :

```bash
node tools/pipeline/rappel.mjs --pour "cron"      # cherche aussi dans les catalogues
grep -i "postgres" vendor/agent-toolkit/free-for-dev/README.md
```

**Fait** — Qwen branché sans clé par Cloudflare (`npm run test:qwen-gratuit`, 12/0).

**À toi, si tu veux 3 gros moteurs de plus** (3 comptes gratuits, sans carte) :
OpenRouter, Cerebras, NVIDIA. Le code les attend déjà — il n'y a que la clé à poser.

---

*Sources vendorisées le 3.09.2026 depuis `raw.githubusercontent.com` :
[ripienaar/free-for-dev](https://github.com/ripienaar/free-for-dev) et
[jeis4wpi/free-llm-api-resources](https://github.com/jeis4wpi/free-llm-api-resources).
Aucun fichier de licence à la racine de ces deux dépôts — le contenu reste la propriété
de ses auteurs, on n'en republie rien.*

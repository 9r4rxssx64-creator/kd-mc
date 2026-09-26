# GUIDE_IPHONE.md — Mémo actions pas à pas (iOS Safari)

> **Destiné à Kevin DESARZENS — iPhone iOS Safari.**
> Toutes les URLs ci-dessous sont **cliquables** depuis ce fichier sur GitHub.
> Format : **🎯 But → 🔗 URL → 👆 Ce que tu vas voir → ✅ Action**.
> ⏱️ Ordre strict de priorité. Fais dans l'ordre, chaque étape débloque la suivante.

---

## 📌 État actuel (17 avril 2026)

| Service | Statut | Note |
|---------|--------|------|
| **GitHub** `9r4rxssx64-creator/CMCteams` | ✅ OK | branche active : `claude/evaluate-resources-shZBa` |
| **Vercel** projets | ✅ OK | `cmc-teams` + `kdmc-agent-monaco.vercel.app` |
| **Agent Claude 24/7** | ⚠️ cron bloqué | GitHub Actions workflow créé — secret manquant |
| **Anthropic API** | ✅ OK | configuré dans env Vercel |
| **Telegram Bot** | ⚠️ chat_id à vérifier | erreur `chat not found` vue |
| **Firebase RTDB** | ✅ OK | `cmcteams-c16ab` |
| **Sentry** (monitoring) | ❌ pas de compte | à créer pour alerte crashes |
| **Notion / Figma** | ⚪ optionnels | si besoin futur |

---

# 🔴 PRIORITÉ 1 — Débloquer le cron de ton agent 24/7 (5 min)

**Pourquoi critique :** ton agent `kdmc-agent-monaco` ne tourne plus car Vercel Hobby bloque les crons < 24h. **J'ai créé un workflow GitHub Actions gratuit qui remplace.** Il te suffit d'ajouter 1 secret.

### 👆 Étape 1.1 — Ajouter AGENT_SECRET dans GitHub

1. **Ouvre :** 🔗 https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions/new
2. **Tu vas voir :** formulaire "New repository secret" — 2 champs : `Name` et `Secret`
3. **✅ Action :**
   - **Name** (exactement) : `AGENT_SECRET`
   - **Secret** (copie depuis Vercel) : la valeur actuelle de `AGENT_SECRET` que tu avais mise dans Vercel
     - 🔗 Pour la retrouver : https://vercel.com/g7vrdynktn-5574s-projects/kdmc-bot-2026/settings/environment-variables
     - **Clique sur `AGENT_SECRET`** → bouton **œil** 👁 pour révéler la valeur → copie-la
4. **Clique "Add secret"** (bouton vert en bas)
5. **Tu reverras :** la liste des secrets avec `AGENT_SECRET` ✅

### 👆 Étape 1.2 — Activer le workflow (si pas déjà actif)

1. **Ouvre :** 🔗 https://github.com/9r4rxssx64-creator/CMCteams/actions
2. **Tu vas voir :** la liste des workflows dont **"Agent KDMC — Cron 24/7"**
3. **Si marqué "Disabled"** → clique dessus, puis bouton **"Enable workflow"**
4. **Test manuel immédiat :** onglet **"Run workflow"** (à droite) → bouton vert **"Run workflow"**
5. **Tu verras :** un job qui démarre, puis ✅ vert après ~30 s si tout est bon

### ⚠️ Étape 1.3 — Désactiver les crons Vercel (pour éviter doublon)

1. **Ouvre :** 🔗 https://github.com/9r4rxssx64-creator/CMCteams/edit/main/tools/agent/vercel.json
2. **Tu verras :** l'éditeur GitHub avec le fichier JSON
3. **✅ Action :** supprimer toute la section `"crons": [...]` OU modifier le fichier pour ne garder que `"functions"`
4. **Commit :** "v9.154: désactivation crons Vercel (remplacés par GitHub Actions)"

**👉 Je peux aussi faire l'étape 1.3 pour toi — dis juste "désactive les crons Vercel".**

---

# 🟠 PRIORITÉ 2 — Corriger l'erreur Telegram (2 min)

**Pourquoi important :** tu as vu `{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}` — ton bot ne peut pas t'envoyer les alertes.

### 👆 Étape 2.1 — Vérifier que tu as bien démarré ton bot

1. **Ouvre Telegram sur ton iPhone**
2. **Cherche ton bot** par son nom `@XXXXX_bot` (tu as son nom quelque part)
3. **Si tu ne l'avais jamais ouvert** → clique sur **"START"** (bouton bleu en bas)
4. **Envoie-lui** `/start` (juste pour créer la conversation)

### 👆 Étape 2.2 — Récupérer le vrai chat_id

1. **Ouvre sur Safari :** 🔗 `https://api.telegram.org/botTON_TOKEN/getUpdates`
   - Remplace `TON_TOKEN` par ton vrai bot token
   - Le token est dans Vercel : 🔗 https://vercel.com/g7vrdynktn-5574s-projects/kdmc-bot-2026/settings/environment-variables → `TELEGRAM_BOT_TOKEN`
2. **Tu vas voir :** du JSON avec `"chat":{"id":XXXXX,...}` — **copie la valeur `id`**
3. **Compare avec `5458942048`** (chat_id actuel) :
   - Si **identique** : pas de problème, le bot ne t'a juste pas trouvé parce qu'il n'avait pas démarré.
   - Si **différent** : il faut mettre à jour `TELEGRAM_CHAT_ID` dans Vercel

### 👆 Étape 2.3 — Mettre à jour Vercel (si nécessaire)

1. **Ouvre :** 🔗 https://vercel.com/g7vrdynktn-5574s-projects/kdmc-bot-2026/settings/environment-variables
2. **Cherche** `TELEGRAM_CHAT_ID`
3. **Clique les 3 points ⋯ → "Edit"**
4. **Colle le nouveau chat_id**
5. **Clique "Save"**
6. **Redéploie :** onglet "Deployments" → 3 points ⋯ du dernier déploiement → "Redeploy"

---

# 🟡 PRIORITÉ 3 — Créer compte Sentry (3 min, gratuit)

**Pourquoi utile :** ton agent et ton app tournent en prod. Sentry t'alerte automatiquement en cas de crash. **5000 events/mois gratuits**.

### 👆 Étape 3.1 — Inscription

1. **Ouvre :** 🔗 https://sentry.io/signup/
2. **Tu vas voir :** "Get started with Sentry" — 3 champs
3. **✅ Action :**
   - **Email** : ton email
   - **Password** : génère-en un fort avec le trousseau iCloud (ne recopie JAMAIS un mot de passe écrit dans un document — ce dépôt est public)
   - **Organization** : `kdmc` ou `cmcteams`
4. **Clique "Sign up"**

### 👆 Étape 3.2 — Créer le projet

1. **Tu verras :** "Start with your platform"
2. **Choisis** → **Browser JavaScript** (pour CMCteams) **ou** **Node.js** (pour l'agent Vercel)
3. **Nom du projet** : `cmcteams`
4. **Clique "Create Project"**

### 👆 Étape 3.3 — Copier la DSN

1. **Tu verras :** une clé qui commence par `https://xxx@oXXXX.ingest.sentry.io/XXXXX`
2. **Copie-la entièrement**
3. **Envoie-la-moi par message :** *"Voici ma DSN Sentry : https://..."*

Je configurerai l'intégration dans CMCteams + l'agent Vercel à la prochaine session.

---

# 🟢 PRIORITÉ 4 — Optionnel : Notion / Figma

**Seulement si tu comptes les utiliser.**

### Notion (documentation projets)
1. 🔗 https://www.notion.so/signup
2. Connecte-toi avec Apple ID
3. MCP Notion s'activera automatiquement au 1er usage

### Figma (mockups UI)
1. 🔗 https://www.figma.com/signup
2. Création gratuite usage perso

**👉 Skip si tu n'en as pas besoin.**

---

# 🎨 BONUS — Génération d'images gratuite (aucun compte)

**Test immédiat Pollinations.ai :**
1. **Ouvre :** 🔗 https://image.pollinations.ai/prompt/casino%20monte%20carlo%20roulette%20table
2. **Tu verras :** une image générée en direct, gratuite, sans clé

Si tu veux intégrer ça dans CMCteams (avatars, bannières, splash), **dis-moi** et je l'ajoute aux outils IA de l'app.

---

# 📊 Récap priorités — ordre d'action

| # | Action | Durée | URL principale | Gratuit ? |
|---|--------|-------|----------------|-----------|
| **1** | 🔴 Ajouter `AGENT_SECRET` dans GitHub + activer workflow | 5 min | [Secrets GitHub](https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions/new) | ✅ |
| **2** | 🟠 Corriger Telegram chat_id | 2 min | [Env vars Vercel](https://vercel.com/g7vrdynktn-5574s-projects/kdmc-bot-2026/settings/environment-variables) | ✅ |
| **3** | 🟡 Créer compte Sentry + m'envoyer DSN | 3 min | [Sentry signup](https://sentry.io/signup/) | ✅ 5k events/mois |
| **4** | 🟢 Notion / Figma (si utile) | 2 min ×2 | — | ✅ |

---

# 📞 Comment me demander d'agir à la prochaine session

Dis-moi simplement :
- *« Désactive les crons Vercel »* → je modifie `tools/agent/vercel.json`
- *« Voici ma DSN Sentry : https://... »* → je configure le monitoring
- *« Le chat_id Telegram correct est : ... »* → je mets à jour Vercel
- *« Intègre Pollinations dans CMCteams »* → j'ajoute l'outil IA de génération d'images
- *« Génère une image pour X »* → j'utilise Pollinations ou Hugging Face

---

# 🔗 Liens directs récurrents

| Pour... | URL |
|---------|-----|
| Voir les workflows GitHub | https://github.com/9r4rxssx64-creator/CMCteams/actions |
| Ajouter un secret GitHub | https://github.com/9r4rxssx64-creator/CMCteams/settings/secrets/actions/new |
| Dashboard Vercel | https://vercel.com/g7vrdynktn-5574s-projects |
| Agent Vercel — env vars | https://vercel.com/g7vrdynktn-5574s-projects/kdmc-bot-2026/settings/environment-variables |
| Agent Vercel — logs | https://vercel.com/g7vrdynktn-5574s-projects/kdmc-bot-2026/logs |
| Agent Vercel — health check | https://kdmc-agent-monaco.vercel.app/api/health |
| Firebase console | https://console.firebase.google.com/project/cmcteams-c16ab |
| Sentry dashboard (après création) | https://sentry.io/organizations/kdmc/ |

---

**Tout est prêt sur la branche `claude/evaluate-resources-shZBa`. Le workflow GitHub Actions attend juste ton `AGENT_SECRET`.**

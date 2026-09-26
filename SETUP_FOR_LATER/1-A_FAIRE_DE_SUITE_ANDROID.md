# 📱 À FAIRE DE SUITE — sur ta tablette Android

> **Tu peux faire tout ça MAINTENANT, sans ordi.**
> Compte ~30 minutes au total.

---

## ✅ Action 1 — Créer ta clé API Anthropic (5 min)

**Pourquoi** : pour que l'agent 24/7 puisse appeler Claude pour les rapports hebdo et l'IA app continue à fonctionner.

1. Ouvre **Chrome** ou Safari sur ta tablette
2. Va sur https://console.anthropic.com/settings/keys
3. Connecte-toi (ton compte qui finance Claude Code)
4. Clique **"Create Key"**
5. Nom : `KDMC-Agent-2026`
6. **COPIE IMMÉDIATEMENT** la clé (commence par `sk-ant-api03-…`)
7. Colle-la dans tes **Notes iPhone** (verrouillage Face ID activé) — **OBLIGATOIRE** elle ne sera plus jamais affichée
8. Note aussi dans tes Notes :
   ```
   ANTHROPIC_API_KEY = sk-ant-api03-xxxxxxxxxxxxx
   ```

⚠️ Si tu perds cette clé, tu devras en créer une nouvelle (l'ancienne devient irrécupérable).

---

## ✅ Action 2 — Créer ton bot Telegram (5 min)

**Pourquoi** : pour recevoir toutes les notifications de l'agent (alertes burn-out, conflits, rapports hebdo).

1. Ouvre l'app **Telegram** sur ta tablette
2. Cherche **@BotFather** → démarre la conversation
3. Tape `/newbot`
4. BotFather demande un nom : tape `KDMC Agent Casino` (ou ce que tu veux)
5. Demande un username : tape `kdmc_agent_kevind_bot` (doit finir par `_bot`)
6. **BotFather te donne le token** — c'est une chaîne du genre : `1234567890:AAEhBP3xxxxxxxxxxxxxx`
7. **COPIE-LE dans tes Notes** :
   ```
   TELEGRAM_BOT_TOKEN = 1234567890:AAEhBP3xxxxxxxxxxxxxx
   ```
8. Démarre une conversation avec ton nouveau bot (cherche son username) → envoie `/start`

---

## ✅ Action 3 — Récupérer ton chat_id Telegram (1 min)

**Pourquoi** : pour que le bot sache où t'envoyer les messages.

1. Toujours dans Telegram, cherche **@userinfobot**
2. Démarre la conversation → tape `/start`
3. Il te répond avec ton **ID** (un nombre type `123456789`)
4. **COPIE-LE dans tes Notes** :
   ```
   TELEGRAM_CHAT_ID = 123456789
   ```

---

## ✅ Action 4 — Vercel sans CLI (via GitHub) (10 min)

**Pourquoi** : pour héberger l'agent 24/7 GRATUITEMENT, sans avoir besoin de Vercel CLI ni d'ordinateur.

### Étape 1 — Créer compte Vercel
1. Ouvre https://vercel.com/signup
2. Choisis **"Continue with GitHub"** (utilise ton compte `9r4rxssx64-creator`)
3. Autorise Vercel à accéder à tes repos

### Étape 2 — Importer le repo
1. Sur le dashboard Vercel → **"Add New… → Project"**
2. Cherche `cmcteams` dans la liste → clique **"Import"**
3. Configuration :
   - **Project Name** : `kdmc-agent`
   - **Framework Preset** : `Other`
   - **Root Directory** : clique "Edit" → tape `tools/agent` → ✓
   - **Build Command** : laisse vide (ou tape `echo "no build"`)
   - **Output Directory** : laisse vide
   - **Install Command** : `npm install`
4. Clique **"Deploy"** → attend ~30 sec
5. Note l'URL fournie : `https://kdmc-agent-xxxxx.vercel.app`

### Étape 3 — Ajouter les variables d'environnement
1. Sur ton projet Vercel → **Settings → Environment Variables**
2. Ajoute UNE PAR UNE (toutes en `Production` + `Preview` + `Development`) :

| Name | Value | Source |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Notes iPhone |
| `TELEGRAM_BOT_TOKEN` | `1234567890:AAEhBP...` | Notes iPhone |
| `TELEGRAM_CHAT_ID` | `123456789` | Notes iPhone |
| `AGENT_SECRET` | `<chaîne aléatoire 32 char>` | Génère via [randomkeygen.com](https://randomkeygen.com/) |
| `FB_URL` | `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app` | (défaut) |

3. **Redéploie** : Deployments → dernier deploy → **"⋯ → Redeploy"** (pour appliquer les vars)

### Étape 4 — Vérifier que ça marche
1. Ouvre dans Chrome :
   ```
   https://kdmc-agent-xxxxx.vercel.app/api/cron?secret=<TON_AGENT_SECRET>&trigger=manual
   ```
2. Tu devrais voir un JSON avec les tâches exécutées
3. **Tu reçois un message Telegram du bot** dans la foulée si conflits détectés

🎉 **L'agent 24/7 tourne tout seul à partir de maintenant.**

Les **3 crons de production** sont automatiques : sauvegarde 3 h, burn-out 8 h, rapport hebdo lundi 9 h (`tools/agent/vercel.json`, vérifié 6.09.2026). **Ni health-check 15 min ni alerte horaire sur Vercel** — cette boucle n'existe qu'en mode `node index.js loop` (Railway/Fly.io).

---

## ✅ Action 5 — (Optionnel) Termux pour avoir Node.js sur Android (10 min)

**Pourquoi** : si tu veux tester l'agent en local sur ta tablette avant de le déployer.

1. Installe **Termux** depuis F-Droid : https://f-droid.org/en/packages/com.termux/
   (PAS Play Store — version Play Store obsolète)
2. Ouvre Termux, tape :
   ```bash
   pkg update && pkg upgrade -y
   pkg install nodejs git -y
   git clone https://github.com/9r4rxssx64-creator/cmcteams.git
   cd cmcteams/tools/agent
   npm install
   export ANTHROPIC_API_KEY="sk-ant-..."
   export TELEGRAM_BOT_TOKEN="..."
   export TELEGRAM_CHAT_ID="..."
   node cli.js list           # liste les tâches
   node cli.js health-check   # test
   ```
3. Si ça marche → tu peux modifier le code en local sur Termux
4. Push vers GitHub : `git add . && git commit -m "..." && git push`

---

## 📋 Résumé après ces 5 actions

✅ Clé Claude **dans tes Notes**
✅ Bot Telegram **créé**
✅ Chat ID Telegram **dans tes Notes**
✅ Agent 24/7 **déployé sur Vercel**, tourne 24h/24
✅ (Optionnel) Termux installé pour développement local

**Tu reçois maintenant** :
- 🔔 Alertes burn-out chaque jour à 8h
- 🔔 Alertes conflits planning toutes les heures (si critiques)
- 🔔 Health-check — **pas sur Vercel** (seulement en mode `loop` Railway/Fly.io)
- 💾 Backup automatique chaque jour à 3h
- 📊 Rapport hebdomadaire chaque lundi à 9h

Le tout via Telegram, sans ordinateur.

---

## 🔄 Pour la suite

Quand tu auras un ordi, ouvre `2-A_FAIRE_SUR_ORDI.md` pour les actions optionnelles :
- Gmail OAuth
- Google Drive backups
- Outlook 365
- Facebook/Instagram/WhatsApp Business
- Claude Code CLI desktop
- MCP servers étendus

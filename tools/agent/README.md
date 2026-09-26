# 🤖 Agent KDMC — Autonome 24/7

Agent Node.js qui tourne en continu (Vercel Cron ou service permanent) et automatise CMC Teams + intégrations sociales.

## 🎯 Ce qu'il fait automatiquement

| Tâche | Fréquence | Action |
|---|---|---|
| `health-check` | Toutes les 15 min | Vérifie app up, 200+ emps, backup récent |
| `conflicts-check` | Toutes les heures | Détecte conflits planning, notifie si critiques |
| `burnout-detect` | Chaque jour 8h | Détecte employés à risque, notifie admin |
| `daily-backup` | Chaque jour 3h | Sauvegarde complète Firebase + rotation 14j |
| `weekly-report` | Lundi 9h | Rapport narratif Claude envoyé Telegram |

## 🚀 Déploiement

### Option 1 — Vercel (gratuit, recommandé)
```bash
cd tools/agent
npm install
npm install -g vercel
vercel --prod
```

Ajouter les variables d'environnement sur Vercel dashboard :
- `ANTHROPIC_API_KEY` (obligatoire)
- `FB_URL` (optionnel, default OK)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (pour notifs)
- `AGENT_SECRET` (protection endpoint)

Les 5 crons démarreront automatiquement.

### Option 2 — Railway (payant mais service continu)
```bash
railway init
railway up
railway variables set ANTHROPIC_API_KEY=sk-ant-...
```

Commande de démarrage : `node index.js loop` (boucle infinie toutes 15 min).

### Option 3 — Fly.io (gratuit avec limites)
`fly launch` → configure + deploy.

### Option 4 — Local (test / dev)
```bash
cd tools/agent
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node cli.js list            # Liste tâches
node cli.js health-check    # Lance une tâche
node cli.js all             # Lance toutes
node index.js loop          # Service continu
```

## 🔐 Variables d'environnement complètes

```env
# Obligatoires
ANTHROPIC_API_KEY=sk-ant-...

# Firebase (défaut OK)
FB_URL=https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app

# Notifications
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
GMAIL_REFRESH_TOKEN=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
NOTIFY_EMAIL_TO=kevind@monaco.mc

# Sécurité
AGENT_SECRET=mon-secret-long

# Optionnels
CLAUDE_MODEL=claude-haiku-4-5-20251001
AGENT_ADMIN_ID=U11804
AGENT_TIMEZONE=Europe/Monaco
```

## 🧪 Test local

```bash
# Test 1 : lister les tâches
node cli.js list

# Test 2 : lancer health-check
node cli.js health-check

# Test 3 : rapport hebdo (nécessite ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... node cli.js weekly-report
```

## 🧠 Ajouter une tâche

1. Crée `tasks/ma-tache.js` avec une fonction exportée `export async function maTache({ state, anthropic, cfg })`
2. Enregistre-la dans `lib/tasks.js` (REGISTRY)
3. Si cron : ajoute dans `vercel.json`

## 📊 Monitoring

L'agent écrit son dernier rapport dans `cmc_agent_last_report` dans Firebase.
Tu peux le consulter via l'URL :
```
https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/cmcteams/cmc_agent_last_report.json
```

## 🔗 Intégrations

L'agent peut appeler les modules `tools/integrations/*` :
- ~~`gmail/client.js`~~ *(prévu, non implémenté — `lib/` contient config, firebase, gauth, notifier, sentry, tasks)* : envoyer emails
- ~~`telegram/client.js`~~ *(prévu, non implémenté — `lib/` contient config, firebase, gauth, notifier, sentry, tasks)* : notifications
- ~~`gdrive/client.js`~~ *(prévu, non implémenté — `lib/` contient config, firebase, gauth, notifier, sentry, tasks)* : backup Drive
- ~~`facebook/client.js`~~ *(prévu, non implémenté — `lib/` contient config, firebase, gauth, notifier, sentry, tasks)*, ~~`instagram/client.js`~~ *(prévu, non implémenté — `lib/` contient config, firebase, gauth, notifier, sentry, tasks)* : posts auto
- etc.

## ⚠️ Limites

- Vercel Cron : 1 cron/jour en free tier, illimité en Pro
- Anthropic API : usage = coût (Haiku ~$1/Mtoken in · $5/Mtoken out — très peu pour un rapport hebdo)
- Firebase : gratuit pour petit trafic

## ⚠️ Vercel — pourquoi `vercel.json` refuse les prévisualisations (05-06/09/2026)

Le 5.09 : **40 déploiements Vercel en une journée** (un par push de chaque branche `claude/*`),
tous `CANCELED` ou `ERROR`, la production `main` annulée à chaque nouveau push, et **un mail
d'échec à Kevin à chaque fois**. L'ancienne commande `git diff --quiet HEAD^ HEAD -- .` sortait en
erreur (`HEAD^` absent du clone Vercel) → Vercel le compte comme un *build error*.

Règle : l'agent est un **cron de production** (sur le plan Hobby les `crons` ne tournent qu'en
production) → **aucune prévisualisation, jamais** ; sur `main`, déploiement seulement si ce dossier
a changé. C'est ce que fait l'`ignoreCommand` de `vercel.json`.

**06/09 — piège suivant, corrigé** : cette explication vivait dans une clé `"_note"` **à l'intérieur
de `vercel.json`**. Vercel valide le fichier contre un schéma strict et l'a **refusé** :
`The vercel.json schema validation failed … should NOT have additional property '_note'`. Résultat :
le déploiement échouait toujours et Kevin recevait toujours le mail — le correctif du 5.09 était
annulé par sa propre note. **`vercel.json` n'accepte ni commentaire ni clé inconnue** : toute
explication se met ici, jamais dans le fichier.

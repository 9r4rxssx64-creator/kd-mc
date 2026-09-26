# 🚀 SETUP KDMC — Configuration complète de l'écosystème

Tout ce que Kevin doit configurer pour avoir **agent 24/7 + 5 intégrations externes + 5 skills + MCP servers**.

---

## 📦 Ce qui a été construit

### Agent autonome 24/7 (`/tools/agent/`)
- Node.js ES modules, compatible Vercel Cron / Railway / Fly.io / local
- 5 tâches périodiques : health-check · conflicts-check · burnout-detect · daily-backup · weekly-report
- Utilise Claude Haiku pour narratifs, Firebase RTDB pour données, Telegram/Gmail pour notifs

### 7 intégrations externes (`/tools/integrations/`)
- **Gmail** — OAuth 2.0, lire/envoyer emails, recherche
- **Telegram** — bot pour notifications et commandes
- **Google Drive** — upload backups, partage fichiers
- **Google Calendar** — événements, réunions casino
- **Outlook** (Microsoft 365) — événements, envoi mails
- **Facebook Pages** — publication, messages, stats
- **Instagram Business** — posts, stories, commentaires
- **WhatsApp Business** — messages clients, templates

### 5 skills Claude Code (`~/.claude/skills/`)
- `cmc-deploy` — release v9.X validée
- `cmc-backup` — export données
- `cmc-planning` — analyse planning + conflits
- `cmc-stats` — statistiques connexions
- `kdmc-status` — état multi-projets

### MCP servers (`/tools/mcp/mcp_settings.example.json`)
- filesystem (3 projets) · memory · github · puppeteer
- gmail · telegram · gdrive · kdmc-firebase

---

## 🔑 Étapes de configuration (ordre recommandé)

### 1. Prérequis (30 min)
```bash
# Node.js 20+
node --version  # doit afficher v20 ou +

# Claude Code CLI local (optionnel mais recommandé)
brew install anthropic/tap/claude  # Mac
# ou curl -fsSL https://claude.ai/install.sh | sh  (Linux)
```

### 2. Cloner le repo sur ton ordi perso (5 min)
```bash
git clone https://github.com/9r4rxssx64-creator/cmcteams.git
cd cmcteams
```

### 3. Clé API Anthropic (5 min)
- Ouvrir https://console.anthropic.com/settings/keys
- Créer une clé nommée `KDMC-Agent`
- La copier **IMMÉDIATEMENT** dans tes Notes iPhone (elle ne sera plus affichée après)

### 4. Telegram (10 min — priorité 1)
```bash
# Sur Telegram :
# 1. Ouvrir @BotFather → /newbot → suivre instructions → copier le token
# 2. Ouvrir @userinfobot → /start → copier ton user_id

# Test local :
cd tools/integrations/telegram
npm install
export TELEGRAM_BOT_TOKEN="1234:ABC..."
export TELEGRAM_CHAT_ID="1234567"
node -e "import('./client.js').then(m => m.sendMessage('✅ Test KDMC'))"
# Tu dois recevoir le message sur Telegram
```

### 5. Gmail (20 min — priorité 2)
Suivre `tools/integrations/gmail/setup.md` :
1. Google Cloud Console → nouveau projet `KDMC-Integrations`
2. Activer Gmail API
3. OAuth Credentials → Desktop → télécharger `credentials.json`
4. `cd tools/integrations/gmail && npm install && node setup.js`
5. Ouvrir l'URL → autoriser → coller le code → `token.json` généré
6. Copier les 3 variables env dans `~/.bashrc`

### 6. Agent 24/7 déployé sur Vercel (30 min — **le plus important**)
```bash
cd tools/agent
npm install

# Créer un compte Vercel (gratuit) si pas déjà fait : https://vercel.com
npm install -g vercel
vercel login
vercel --prod

# Ajouter les variables env sur le dashboard Vercel :
# https://vercel.com/<ton-username>/kdmc-agent/settings/environment-variables
# - ANTHROPIC_API_KEY = sk-ant-...  (obligatoire)
# - TELEGRAM_BOT_TOKEN = ...
# - TELEGRAM_CHAT_ID = ...
# - AGENT_SECRET = <génère une chaîne aléatoire longue>
# - GMAIL_CLIENT_ID / SECRET / REFRESH_TOKEN  (optionnel)
```

Vercel activera automatiquement les 5 crons (définis dans `vercel.json`).

**Vérification** :
```bash
# Ton endpoint public sera : https://kdmc-agent.vercel.app/api/cron
curl -H "Authorization: Bearer <AGENT_SECRET>" "https://kdmc-agent.vercel.app/api/cron?trigger=manual"
# Tu dois recevoir un JSON avec les tâches exécutées
```

### 7. Réseaux sociaux (optionnels, 1-3h chacun)
- **Facebook Pages** : `tools/integrations/facebook/setup.md`
- **Instagram Business** : `tools/integrations/instagram/setup.md`
- **WhatsApp Business** : `tools/integrations/whatsapp/setup.md` (nécessite validation Meta 1-5j)

### 8. MCP servers sur Claude Code local (15 min)
```bash
# Copier le template
cp tools/mcp/mcp_settings.example.json ~/.claude/mcp_settings.json

# Remplir les tokens
nano ~/.claude/mcp_settings.json

# Recharger Claude Code
# Les MCP seront disponibles dans ta prochaine session
```

### 9. Skills Claude Code (déjà en place)
Les skills sont dans `~/.claude/skills/` et disponibles immédiatement. Test :
```
/cmc-deploy     # lance la routine de release
/cmc-stats      # génère un rapport stats
/kdmc-status    # état de tous les projets
```

---

## 🧪 Tests de validation

### Test 1 : Agent local
```bash
cd tools/agent
export ANTHROPIC_API_KEY=sk-ant-...
node cli.js health-check
# Doit afficher l'état de l'app CMC Teams
```

### Test 2 : Agent Vercel
```bash
curl -H "Authorization: Bearer <AGENT_SECRET>" https://kdmc-agent.vercel.app/api/cron
```

### Test 3 : Notification Telegram
```bash
cd tools/agent
node cli.js conflicts-check
# Si conflits critiques ≥ 3 → tu reçois un message Telegram
```

### Test 4 : Rapport hebdo
```bash
node cli.js weekly-report
# Rapport généré par Claude Haiku, envoyé sur Telegram
```

### Test 5 : Backup quotidien
```bash
node cli.js daily-backup
# Sauvegarde JSON complète dans Firebase (clé cmc_agent_backup_YYYY-MM-DD)
```

---

## 🚨 Sécurité des tokens

**RÈGLE D'OR** : aucun secret dans le repo Git.

Storage recommandé :
1. **Vercel Environment Variables** (pour l'agent) — chiffré, pas commit
2. **`~/.bashrc` ou `~/.zshrc`** (pour les tests locaux)
3. **Fichier `~/.claude/secrets/kdmc.env`** (lu par les scripts)
4. **Gestionnaire de mots de passe** (Keychain, 1Password…) pour stockage long terme

Exemple `~/.claude/secrets/kdmc.env` (gitignored) :
```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=1234:ABC...
TELEGRAM_CHAT_ID=1234567
GMAIL_REFRESH_TOKEN=1//...
GMAIL_CLIENT_ID=...-apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-...
FB_PAGE_TOKEN=EAA...
IG_ACCESS_TOKEN=EAA...
IG_USER_ID=17841...
WA_ACCESS_TOKEN=EAA...
WA_PHONE_NUMBER_ID=100...
GDRIVE_FOLDER_ID=1aB...
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
MS_USER_ID=kevind@monaco.mc
GITHUB_TOKEN=ghp_...
AGENT_SECRET=<chaîne aléatoire 32+ caractères>
```

---

## 💰 Coûts estimés (mensuel)

| Service | Free tier | Usage KDMC typique | Coût |
|---|---|---|---|
| Vercel | 100 GB bandwidth | Crons légers | **0 €** |
| Anthropic API | - | Rapport hebdo Haiku (~500 tokens) | **~0,02 €** |
| Firebase RTDB | 1 GB | CMC Teams usage normal | **0 €** |
| Telegram | illimité | N/A | **0 €** |
| Gmail API | 1 Md requêtes/j | Quelques emails/jour | **0 €** |
| Google Drive | 15 GB | Backups 14j | **0 €** |
| Facebook Pages | illimité | Posts 1/semaine | **0 €** |
| Instagram Business | 25 posts/j | 1-2/semaine | **0 €** |
| WhatsApp Business | 1000 conv/mois | Dépend usage | **0 € → ~30 €/mois** |
| Outlook 365 | Abonnement existant | Via Azure App gratuit | **0 €** |

**Total** : ~0 € pour usage perso, jusqu'à 50 €/mois si WhatsApp Business intensif.

---

## 🔄 Maintenance

### Logs de l'agent
Dashboard Vercel → Functions → `api/cron` → Logs

### Mise à jour de l'agent
```bash
cd tools/agent
# Modifier ce qu'il faut
vercel --prod  # redeploy
```

### Ajouter une tâche
1. Créer `tools/agent/tasks/ma-tache.js` (modèle dans `health-check.js`)
2. Enregistrer dans `tools/agent/lib/tasks.js` (REGISTRY)
3. Si cron : ajouter dans `vercel.json`
4. Redéployer

### Ajouter un skill
1. Créer `~/.claude/skills/mon-skill/SKILL.md`
2. Format frontmatter : `name` + `description`
3. Immédiatement disponible

### Ajouter un MCP server
1. Éditer `~/.claude/mcp_settings.json`
2. Ajouter une entrée dans `mcpServers`
3. Redémarrer Claude Code

---

## 📞 En cas de problème

1. **L'agent ne tourne plus** → vérifier Vercel dashboard > Functions logs
2. **Notifications ne partent plus** → tester `node cli.js health-check` en local
3. **Clé API expirée** → régénérer dans console.anthropic.com, mettre à jour Vercel env vars
4. **Firebase indisponible** → l'app CMC Teams continue en localStorage-only (pas de sync)
5. **Telegram bot cassé** → vérifier token avec `@BotFather` → `/mybots`

---

## 🎯 Résumé checklist

Minimale pour avoir l'agent 24/7 fonctionnel :

- [ ] Clé Anthropic générée + sauvegardée dans Notes
- [ ] Bot Telegram créé + token + chat_id copiés
- [ ] Repo cloné sur ton ordi
- [ ] `tools/agent/` déployé sur Vercel
- [ ] Variables env configurées sur Vercel (au minimum ANTHROPIC + TELEGRAM)
- [ ] 5 crons activés (vérif dashboard Vercel)
- [ ] Premier test manuel : `curl .../api/cron?trigger=manual` → OK

À partir de là, l'agent tourne **tout seul 24/7** et tu reçois les alertes sur Telegram.

Les autres intégrations (Gmail, Drive, Calendar, FB/IG/WA, Outlook) sont **optionnelles** et peuvent être ajoutées progressivement selon tes besoins.

---

*Dernière mise à jour : 2026-04-13 (CMC Teams v9.118)*

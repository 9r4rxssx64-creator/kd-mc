# 🔑 Guide d'accès externes (Kevin DESARZENS)

Réponses honnêtes à tes questions. Ce que je **peux** faire, ce que je **ne peux pas**, et les **solutions réelles** qui existent.

---

## 1. Accès Facebook / Instagram / WhatsApp / Messenger / Mail / Autres

### ❌ Ce que je **ne peux pas faire** (honnêteté)

- Je n'ai **pas** un compte Claude qui se connecte directement à Facebook / Insta / WhatsApp pour toi. Aucun LLM n'a ça.
- Je **ne peux pas** scraper ton flux Instagram ou lire tes DMs Facebook en tapant ton mot de passe. Ces réseaux bloquent (et ce serait illégal vis-à-vis de leurs CGU).
- WhatsApp et Messenger ont une **chiffrement bout-en-bout** — même Meta ne peut pas lire tes messages, je ne peux encore moins.

### ✅ Ce qui **existe vraiment** (options réelles)

| Plateforme | Méthode officielle | Permissions | Complexité |
|---|---|---|---|
| **Gmail / Outlook** | API OAuth 2.0 | lire/envoyer emails, gérer labels | ⭐ facile |
| **Facebook Pages** | Graph API (pas profil perso) | poster, stats, messages pages | ⭐⭐ moyen |
| **Instagram Business** | Graph API | poster, stats (compte pro seulement) | ⭐⭐ moyen |
| **WhatsApp Business** | WhatsApp Business API | envoyer messages (clients opt-in) | ⭐⭐⭐ cher (compte entreprise Meta) |
| **Messenger** | Messenger Platform API | bot réponses, pas DM perso | ⭐⭐ moyen |
| **Twitter / X** | API v2 | poster tweets, lire timeline | ⭐⭐ payant |
| **LinkedIn** | LinkedIn API | poster, stats entreprise | ⭐⭐ limité |
| **Telegram** | Bot API (gratuit) | tout via bot créé par toi | ⭐ facile |

### 🛠 Comment me donner accès concrètement

**Pour Gmail (exemple le plus simple)** :
1. Tu crées un projet Google Cloud Console → active Gmail API
2. Tu génères des credentials OAuth (token `refresh_token`)
3. Tu ajoutes ce token dans les variables d'environnement de l'app ou d'un script Node
4. Je peux écrire le code Node/Python qui utilise `refresh_token` pour envoyer/lire

**Exemple concret automatisé** :
```javascript
// gmail-auto.js (à faire tourner sur ton ordi ou serveur)
const {google} = require('googleapis');
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
oauth2.setCredentials({refresh_token: process.env.GMAIL_REFRESH_TOKEN});
const gmail = google.gmail({version:'v1', auth: oauth2});
// Lister 10 derniers mails
gmail.users.messages.list({userId:'me', maxResults:10});
```

**Pour WhatsApp personnel** : impossible officiellement. Seules options :
- `whatsapp-web.js` (librairie non officielle qui ouvre WhatsApp Web en headless)
  - Risque de ban de ton compte
  - Pas recommandé pour usage pro
- WhatsApp Business API (payant, compte entreprise validé Meta)

### 📌 Solution **pragmatique** que je recommande

**Pour ton cas (usage perso + pro)** :
1. **Gmail** : OAuth facile, je peux lire/envoyer en automatique
2. **Telegram** : gratuit, créé un bot, tout automatisable
3. **WhatsApp Business** : si volume pro important (sinon trop cher)
4. **Facebook/Insta** : uniquement si page business/créateur (pas profil perso)

Dis-moi **lequel tu veux en priorité**, et je te guide étape par étape pour la configuration. On stockera les tokens dans Firebase admin-only (même mécanisme que la clé Claude) ou dans un `.env` local chiffré.

---

## 2. Accès téléphone / tablette / ordinateur

### ❌ Ce que je **ne peux pas faire**

- Je ne peux **pas** piloter ton iPhone à distance depuis cette conversation.
- Je ne peux **pas** voir ton écran, taper sur ton clavier, ouvrir des apps.
- Claude Code tourne dans un **sandbox isolé** sur le serveur Anthropic, pas sur tes devices.

### ✅ Ce qui **existe vraiment**

| Besoin | Solution | Note |
|---|---|---|
| **Automatiser l'iPhone** | **iOS Shortcuts** (Raccourcis) + appels API → je peux créer les raccourcis | Officiel, gratuit |
| **Automatiser Mac** | **AppleScript / Automator / Shortcuts Mac** | Officiel |
| **Automatiser Windows** | **PowerShell / AutoHotkey / Power Automate** | Gratuit |
| **Automatiser Android** | **Tasker / Termux / ADB** | Puissant mais technique |
| **Claude Code local** | Installer le CLI `claude` sur Mac/Linux/Windows | **RECOMMANDÉ** |

### 🛠 Solution recommandée : **Claude Code CLI en local**

**Tu installes le CLI sur ton ordi**, et je peux :
- Lire tes fichiers (dossiers, documents)
- Exécuter des commandes
- Modifier du code
- Mais uniquement **quand tu lances une session** et seulement les fichiers que tu autorises

```bash
# Installation (Mac/Linux)
curl -fsSL https://claude.ai/install.sh | sh
# Ou avec Homebrew
brew install anthropic/tap/claude

# Windows : télécharger l'installateur sur claude.ai/code
```

Puis :
```bash
cd /chemin/vers/mon/projet
claude
# Tu me donnes les instructions, je travaille sur tes fichiers locaux
```

**Pour l'iPhone** : il n'y a pas de CLI Claude Code sur iOS (pas possible techniquement avec le sandbox App Store). Mais il y a **l'app Claude Code iOS** que tu utilises déjà (cette conversation).

**Pour des tâches sur iPhone** (envoyer des SMS auto, créer calendrier, etc.) :
- Je crée des **Raccourcis Apple** (fichiers .shortcut)
- Tu les importes via AirDrop/iCloud → disponibles dans ton app Raccourcis
- Exécution par Siri ou bouton

---

## 3. Installation CLI Claude Code

### Status : **déjà fait** ✅

Je tourne **actuellement** dans une session Claude Code (sur le serveur Anthropic). C'est ce qui permet cette conversation avec accès aux fichiers.

**Pour en installer un sur ton ordi perso** (complément utile) :

**Mac** :
```bash
brew install anthropic/tap/claude
claude auth login  # connexion avec ton compte
cd ~/mon-projet
claude             # lance une session locale
```

**Linux** :
```bash
curl -fsSL https://claude.ai/install.sh | sh
claude auth login
```

**Windows** :
- Télécharger l'installateur depuis https://claude.com/claude-code
- Ouvrir Terminal ou PowerShell
- `claude auth login`

**Avantage vs l'app iOS que tu utilises** :
- Accès complet aux fichiers de ton ordi (pas un sandbox limité)
- Peut modifier ton code en local sans passer par GitHub
- Peut exécuter commandes shell sur ton système
- Intégration IDE (VS Code plugin disponible)

---

## 4. Subagents & outils pour travailler

### Ce que j'utilise **déjà dans cette conversation**

| Outil | Usage | Quand |
|---|---|---|
| `Explore` subagent | Recherche multi-fichiers, audits | Questions larges / vérifs |
| `Plan` subagent | Architecture de changements | Avant gros refactor |
| `general-purpose` subagent | Tâches complexes multi-étapes | Rare |
| `Grep` / `Glob` | Recherche rapide directe | Tout le temps |
| `Bash` | Commandes système | Tests, git, node |
| `Edit` / `Write` | Modification fichiers | Code |
| `TodoWrite` | Suivi tâches | Chaque demande multi-step |

**J'utilise déjà 3-5 subagents en parallèle** pour auditer / chercher sans encombrer le contexte principal. Exemple dans cette session : audit crashes, audit automations, etc.

### MCP Servers (Model Context Protocol)

Les **MCP servers** étendent mes capacités. Ceux **disponibles maintenant** dans cette conversation :
- `github` : lire/écrire PRs, issues, branches, commentaires ← **actif**

**MCP servers populaires à installer** (dans ton Claude Code local) :

| MCP | Pour faire quoi | Install |
|---|---|---|
| **filesystem** | Accès fichiers locaux avancé | `npm install -g @modelcontextprotocol/server-filesystem` |
| **google-drive** | Lire/écrire Google Drive | Repo officiel `modelcontextprotocol/servers` |
| **slack** | Messages Slack automatisés | Idem |
| **postgres** | Requêtes base de données | Idem |
| **puppeteer** | Contrôler un navigateur | Idem |
| **memory** | Mémoire persistante knowledge graph | Idem |
| **gmail** | Gmail complet | Community MCP |
| **calendar** | Google Calendar | Community MCP |
| **obsidian** | Notes Obsidian | Community MCP |

**Installation type (Claude Code local)** :
```bash
# Ajouter dans ~/.claude/mcp_settings.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/kevin/Documents"]
    },
    "gmail": {
      "command": "node",
      "args": ["/path/to/gmail-mcp/dist/index.js"],
      "env": {"GMAIL_TOKEN": "..."}
    }
  }
}
```

### Plugins / Skills Claude

Dans ton `~/.claude/skills/` je peux créer des skills personnalisés :
- `/planning` : raccourci pour lancer une analyse du planning CMC
- `/deploy` : auto commit + push + vérif CI
- `/backup` : export auto complet
- `/weekly-report` : génère un rapport hebdo

Dis-moi lesquels tu veux et je les crée.

---

## 5. Sauvegarde continue en cas de déconnexion

### Ce qui existe déjà (CMC Teams v9.117)

✅ **Côté app** :
- localStorage à chaque modification (synchrone, jamais perdu)
- Firebase sync avec **circuit breaker + queue offline** (retry 2s/4s/8s + flush au retour online)
- Auto-backup quotidien (rotation 7 jours) + post-import (rotation 14)
- Snapshot pré-import (rollback 1-clic)
- Export JSON manuel

✅ **Côté Claude Code (cette conversation)** :
- Les `.jsonl` de session sont auto-sauvés toutes les ~30 sec côté serveur
- Si tu fermes l'app ou perds la connexion, la session reprend exactement où tu étais
- Le sandbox persiste même entre messages (état fichier préservé)

### Améliorations possibles pour "tâches en cours continuent"

Actuellement, **si tu fermes la conversation**, je **ne continue pas** les tâches longues en arrière-plan. Les sessions Claude sont **interactives** : j'agis quand tu me parles.

**Solutions réelles** :
1. **GitHub Actions CI/CD** : chaque push déclenche des tests + lint + déploiement auto
2. **Cron jobs** sur un serveur (Cloudflare Worker cron, Vercel cron) qui font tâches périodiques
3. **Agents autonomes** : Claude peut être déployé comme agent (via Anthropic API + SDK) qui tourne en continu sur un serveur

Pour CMC Teams :
- Tests E2E auto à chaque push (déjà en place : `.github/workflows/tests.yml`)
- Backup auto quotidien (déjà en place côté app)
- Audits hebdo possibles via GitHub Action + email notif

---

## 📞 Action immédiate que je te propose

Dis-moi **par ordre de priorité** :

1. 🔑 **Quel compte externe** je dois intégrer en premier ? (Gmail, Telegram, Insta business…)
2. 💻 **Tu veux que j'installe le CLI Claude Code** sur ton ordi ? (je peux te guider)
3. 🔌 **Quels MCP servers** t'intéressent ? (filesystem, gmail, drive, slack…)
4. 🤖 **Création de skills** : lesquels ? (je fais `/planning`, `/backup`, `/weekly-report`…)
5. ☁ **Agent autonome** CMC Teams qui tourne 24/7 ? (via Anthropic API + Vercel/Railway)

À chaque fois tu me dis lequel, je te fais la procédure étape par étape.

---

*Dernière mise à jour : 2026-04-13 (v9.118)*

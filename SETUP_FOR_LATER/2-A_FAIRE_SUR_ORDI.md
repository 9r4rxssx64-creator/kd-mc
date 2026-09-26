# 💻 À FAIRE SUR ORDI — quand tu en auras un

> **Compte 1 à 2h** pour tout configurer la première fois.
> Suppose Mac, Windows ou Linux. Adaptations notées si besoin.

---

## ⚡ TL;DR — L'essentiel en 30 minutes

Si tu veux juste un environnement de dev fonctionnel rapidement :

```bash
# 1. Installer Node.js 20+
# Mac : brew install node
# Windows : télécharger sur https://nodejs.org
# Linux : sudo apt install nodejs npm

# 2. Installer Claude Code CLI
# Mac : brew install anthropic/tap/claude
# Linux : curl -fsSL https://claude.ai/install.sh | sh
# Windows : télécharger sur https://claude.com/claude-code

# 3. Cloner le repo
git clone https://github.com/9r4rxssx64-creator/cmcteams.git
cd cmcteams

# 4. Installer les dépendances de l'agent
cd tools/agent && npm install && cd ../..

# 5. Lancer Claude Code dans le projet
claude

# Tu as maintenant accès à tous les fichiers en local
```

---

## 📦 Installations à faire

### 1. Node.js 20+
**Pourquoi** : tous les modules de l'agent et intégrations en ont besoin.

- **Mac (avec Homebrew)** :
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew install node
  node --version  # doit afficher v20+
  ```
- **Windows** : télécharger LTS sur https://nodejs.org → installer
- **Linux** :
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

### 2. Git
- **Mac** : déjà installé (sinon `brew install git`)
- **Windows** : https://git-scm.com/download/win
- **Linux** : `sudo apt install git`

Configure :
```bash
git config --global user.name "Kevin DESARZENS"
git config --global user.email "kevind@monaco.mc"
```

### 3. Claude Code CLI
**Pourquoi** : pour avoir Claude en local avec accès à TOUS tes fichiers (pas le sandbox web).

- **Mac** : `brew install anthropic/tap/claude`
- **Linux** : `curl -fsSL https://claude.ai/install.sh | sh`
- **Windows** : https://claude.com/claude-code

Connexion :
```bash
claude auth login
# Ouvre une fenêtre navigateur → connecte-toi avec ton compte
```

### 4. Éditeur de code (recommandé)
- **VS Code** : https://code.visualstudio.com (gratuit, supporte tout)
- **Cursor** : https://cursor.com (VS Code + IA intégrée, payant)
- Extensions VS Code utiles :
  - "Claude Code" (officielle Anthropic)
  - "GitLens" (historique git visuel)
  - "Prettier" (formatage auto)
  - "ESLint" (validation JS)

### 5. Navigateur Chromium (pour tests)
Pour tester ta PWA CMC Teams localement :
- Chrome / Edge / Brave (n'importe lequel)

---

## 🔧 Configuration locale du projet CMC Teams

```bash
# Cloner
git clone https://github.com/9r4rxssx64-creator/cmcteams.git
cd cmcteams

# Tester l'app en local (Python intégré)
python3 -m http.server 8080
# Puis ouvrir http://localhost:8080 dans Chrome
# Login admin avec U11804

# Ou Node :
npx http-server -p 8080
```

### Tests automatisés
```bash
# Installation Puppeteer (pour tests E2E)
npm install puppeteer --no-save

# Lancer les 54 tests sur 6 devices
node tools/tests/e2e.test.js
# Doit afficher : 54/54 PASS
```

---

## 🤖 Agent 24/7 — gestion locale

### Si tu veux le tester en local avant de le déployer
```bash
cd tools/agent
npm install

# Charger les variables d'environnement
export ANTHROPIC_API_KEY="sk-ant-..."
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."

# Tester une tâche
node cli.js health-check
node cli.js conflicts-check
node cli.js weekly-report

# Lancer en mode boucle (alternative à Vercel cron)
node index.js loop
```

### Si tu veux mettre à jour l'agent déployé
```bash
cd tools/agent
# Modifier ce qu'il faut
git add .
git commit -m "agent: ..."
git push origin main
# Vercel redéploie automatiquement (~30s)
```

---

## 🔐 Configuration des secrets

### Créer le fichier `~/.claude/secrets/kdmc.env`
```bash
mkdir -p ~/.claude/secrets
chmod 700 ~/.claude/secrets
nano ~/.claude/secrets/kdmc.env
```

Contenu (à adapter avec tes vraies valeurs) :
```env
# Core
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx

# Firebase
FB_URL=https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:AAEhBP3xxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789

# GitHub (pour push depuis l'agent)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_REPO=9r4rxssx64-creator/cmcteams

# Email notifs (optionnel, voir partie Gmail OAuth)
NOTIFY_EMAIL_TO=kevind@monaco.mc

# Agent
AGENT_SECRET=ma-chaine-aleatoire-32-caracteres-minimum
AGENT_TIMEZONE=Europe/Monaco
AGENT_ADMIN_ID=U11804
```

Charger automatiquement à chaque terminal :
```bash
# Ajouter à la fin de ~/.bashrc ou ~/.zshrc
echo 'set -a; [ -f ~/.claude/secrets/kdmc.env ] && source ~/.claude/secrets/kdmc.env; set +a' >> ~/.zshrc
source ~/.zshrc
```

### S'assurer que les secrets sont gitignorés
```bash
cd ~/.claude/secrets
echo "*" > .gitignore
echo "!.gitignore" >> .gitignore
```

---

## 🔌 Configuration MCP servers

```bash
# Copier le template
cp /home/user/cmcteams/tools/mcp/mcp_settings.example.json ~/.claude/mcp_settings.json

# Éditer
nano ~/.claude/mcp_settings.json

# Remplacer chaque "REMPLACE_MOI" par ta vraie valeur (cf. ~/.claude/secrets/kdmc.env)
```

Pour activer un MCP supplémentaire :
```bash
# Filesystem (déjà inclus)
# Memory (déjà inclus)
# GitHub (déjà inclus, ajouter ton GITHUB_TOKEN)

# MCP optionnels à découvrir :
# https://github.com/modelcontextprotocol/servers
```

Redémarrer Claude Code après chaque modif → MCP rechargés.

---

## 📋 Checklist d'installation ordi

- [ ] Node.js 20+ installé (`node --version`)
- [ ] Git configuré (`git config --list`)
- [ ] Claude Code CLI installé (`claude --version`)
- [ ] Repo cloné (`cd ~/dev/cmcteams && ls`)
- [ ] Tests E2E passent (`node tools/tests/e2e.test.js` → 54/54)
- [ ] `~/.claude/secrets/kdmc.env` créé et rempli
- [ ] `~/.claude/mcp_settings.json` configuré
- [ ] App testable en local (`python3 -m http.server 8080`)
- [ ] Premier push test : modifier README → commit → push → vérifier déploiement GitHub Pages

---

## 🎯 Une fois tout installé

Tu peux :
- Modifier le code en confort (VS Code + Claude Code CLI)
- Ajouter des features à l'agent (`tools/agent/tasks/*.js`)
- Créer de nouveaux skills (`~/.claude/skills/<nom>/SKILL.md`)
- Lancer Claude Code en local : `cd cmcteams && claude`
- Démarrer les nouveaux projets : IA-KDMC, e-KDMC

Et passer aux **intégrations optionnelles** (`3-INTEGRATIONS_OPTIONNELLES.md`).

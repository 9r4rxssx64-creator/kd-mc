# ✅ CHECKLIST GLOBALE — coche au fur et à mesure

> Vue d'ensemble. Ouvre les autres fichiers pour les détails de chaque étape.

---

## 📱 PHASE 1 — Sur Android (~30 min, à faire MAINTENANT)

- [ ] **A1** — Récupérer/créer clé Anthropic API sur https://console.anthropic.com/settings/keys
  - Si déjà créée pour l'app CMC Teams : réutiliser la même clé ✅
  - Coller dans Notes iPhone (verrouillage Face ID)
- [ ] **A2** — Créer bot Telegram via https://t.me/BotFather
  - `/newbot` → nom + username `_bot`
  - Coller le **TOKEN** (chaîne `1234:AAEhBP...`) dans Notes
- [ ] **A3** — Récupérer ton chat_id via https://t.me/userinfobot
  - `/start` → coller l'ID dans Notes
- [ ] **A4** — Créer compte Vercel via https://vercel.com/signup (Continue with GitHub)
- [ ] **A5** — Importer le repo `cmcteams` sur Vercel
  - Root directory : `tools/agent`
  - Deploy
- [ ] **A6** — Ajouter les variables d'environnement Vercel
  - `ANTHROPIC_API_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
  - `AGENT_SECRET` (chaîne aléatoire, générer sur https://randomkeygen.com)
- [ ] **A7** — Redéployer Vercel (Settings > Deployments > Redeploy)
- [ ] **A8** — Tester l'endpoint dans Chrome :
  ```
  https://kdmc-agent-xxxxx.vercel.app/api/cron?secret=AGENT_SECRET&trigger=manual
  ```
- [ ] **A9** — Vérifier réception message Telegram du bot

✅ **À ce stade l'agent 24/7 est OPÉRATIONNEL sur Vercel.**

---

## 💻 PHASE 2 — Quand tu auras un ordi (~1-2h)

- [ ] **B1** — Installer Node.js 20+
- [ ] **B2** — Installer Git + configurer `user.name` + `user.email`
- [ ] **B3** — Installer Claude Code CLI (`brew install anthropic/tap/claude`)
- [ ] **B4** — Cloner le repo : `git clone https://github.com/9r4rxssx64-creator/cmcteams.git`
- [ ] **B5** — Installer dépendances agent : `cd cmcteams/tools/agent && npm install`
- [ ] **B6** — Créer `~/.claude/secrets/kdmc.env` avec tous les tokens
- [ ] **B7** — Tester localement : `node cli.js health-check`
- [ ] **B8** — Configurer MCP : copier `tools/mcp/mcp_settings.example.json` → `~/.claude/mcp_settings.json`
- [ ] **B9** — Installer VS Code + extension Claude Code
- [ ] **B10** — Tester : `cd cmcteams && claude` (lance Claude Code en local)

✅ **À ce stade tu peux développer en local en confort.**

---

## 🔌 PHASE 3 — Intégrations optionnelles (au fil de l'eau)

Ordre recommandé :

- [ ] **C1** — Gmail OAuth (cf `tools/integrations/gmail/setup.md`)
- [ ] **C2** — Google Drive (réutilise projet Google Cloud Gmail)
- [ ] **C3** — Google Calendar (idem)
- [ ] **C4** — Outlook 365 (si compte SBM Office 365)
- [ ] **C5** — Facebook Pages (si page business)
- [ ] **C6** — Instagram Business (si compte business)
- [ ] **C7** — WhatsApp Business (uniquement pour e-KDMC)

---

## 🔐 PHASE 4 — Configuration finale & maintenance

- [ ] **D1** — Sauvegarder secrets dans Notes iPhone + Bitwarden
- [ ] **D2** — Mirror repo sur GitLab (backup)
- [ ] **D3** — Programmer rappel iPhone "Vérifier tokens KDMC" tous les 3 mois
- [ ] **D4** — Tester health-check Vercel + Firebase 1× par mois
- [ ] **D5** — Faire un export backup CMC complet 1× par mois

---

## 📊 ÉTAT INITIAL (rempli par toi au fur et à mesure)

| Date | Phase | Action | Statut |
|---|---|---|---|
| | A1 | Clé Anthropic | ⬜ |
| | A2 | Bot Telegram créé | ⬜ |
| | A3 | Chat ID récupéré | ⬜ |
| | A4 | Compte Vercel | ⬜ |
| | A5 | Repo importé Vercel | ⬜ |
| | A6 | Variables env | ⬜ |
| | A7 | Redéploy | ⬜ |
| | A8 | Test endpoint | ⬜ |
| | A9 | Message Telegram reçu | ⬜ |
| | B1-B10 | Setup ordi complet | ⬜ |
| | C1-C7 | Intégrations | ⬜ |
| | D1-D5 | Maintenance | ⬜ |

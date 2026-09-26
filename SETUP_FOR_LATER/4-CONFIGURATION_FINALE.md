# 🔐 CONFIGURATION FINALE — sécurité + maintenance long terme

> **À faire une fois quand tout fonctionne**, puis revoir tous les 3-6 mois.

---

## 1. Sauvegarde des secrets (CRITIQUE)

### Pourquoi c'est important
Si tu perds ton ordi, tu perds tous les tokens. Refaire l'OAuth = parfois impossible (token Meta expirés, revocation).

### Stratégie 3-2-1 (recommandée)
- **3 copies** de chaque secret
- **2 supports différents**
- **1 hors site**

#### Copie 1 — Notes iPhone (verrouillage Face ID)
Note dédiée nommée 🔐 `KDMC Tokens Master` :
```
=== KDMC SECRETS — ne jamais partager ===
Date dernière maj : 2026-04-13

ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
TELEGRAM_BOT_TOKEN=1234:AAEhBP3xxxxx
TELEGRAM_CHAT_ID=123456789
AGENT_SECRET=ma-chaine-32-char

GMAIL_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxxxx
GMAIL_REFRESH_TOKEN=1//xxxxxx

GDRIVE_FOLDER_ID=1aBxxxxx

FB_PAGE_TOKEN=EAAxxxxx (expire dans 60j si pas longue durée)
IG_USER_ID=178xxxxx
IG_ACCESS_TOKEN=EAAxxxxx

WA_ACCESS_TOKEN=EAAxxxxx
WA_PHONE_NUMBER_ID=100xxxxx

MS_TENANT_ID=xxxxx
MS_CLIENT_ID=xxxxx
MS_CLIENT_SECRET=xxxxx (expire dans 24 mois)

GITHUB_TOKEN=ghp_xxxxx (expire ?)
```

#### Copie 2 — Gestionnaire de mots de passe
- **Bitwarden** (gratuit, open source) : créer un dossier "KDMC" → 1 entrée par token
- **1Password** (payant, plus user-friendly)
- **Apple Keychain** (intégré iOS, sync automatique entre devices)

#### Copie 3 — Fichier chiffré sur Drive ou clé USB
```bash
# Sur ordi (quand tu en as un)
cd ~
gpg --symmetric --cipher-algo AES256 .claude/secrets/kdmc.env
# Crée kdmc.env.gpg → upload Google Drive ou clé USB
# Mot de passe : à RETENIR (sinon irrécupérable)
```

---

## 2. Rotation des secrets

Certains tokens expirent. Marquer des rappels iPhone :

| Token | Expiration | Action de rotation |
|---|---|---|
| ANTHROPIC_API_KEY | jamais (sauf revoke) | Si compromise → revoke + créer nouveau |
| TELEGRAM_BOT_TOKEN | jamais | Idem |
| GMAIL_REFRESH_TOKEN | jamais (sauf revoke) | Idem |
| FB_PAGE_TOKEN court | 60 jours | Convertir en longue durée (cf setup.md) |
| FB_PAGE_TOKEN long | jamais (60j puis permanent) | Vérifier statut "Never expires" |
| MS_CLIENT_SECRET | 24 mois | Régénérer dans Azure Portal |
| WA_ACCESS_TOKEN | jamais (si System User) | Vérifier que c'est bien permanent |
| AGENT_SECRET | jamais (à ta convenance) | Roter tous les 6 mois recommandé |
| GITHUB_TOKEN | configurable | Régénérer si compromis |

Rappel iPhone :
```
Calendrier > Nouvelle alerte
Titre : 🔐 Vérifier tokens KDMC
Récurrence : tous les 3 mois
Notes : ouvrir Notes "KDMC Tokens Master" + cocher rotation Azure si > 18 mois
```

---

## 3. Surveillance de l'agent 24/7

### Vérifier que l'agent tourne
```bash
# Tester l'endpoint
curl -H "Authorization: Bearer $AGENT_SECRET" \
  "https://kdmc-agent-monaco.vercel.app/api/cron?trigger=manual" | jq

# Voir les logs Vercel
# Dashboard Vercel > Functions > api/cron > Logs
```

### Indicateurs santé
L'agent stocke son dernier rapport dans Firebase (clé `cmc_agent_last_report`) :
```bash
curl -s "https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/cmcteams/cmc_agent_last_report.json" | jq '{status, trigger, duration, errors_count: (.errors | length)}'
```

Si `status: "error"` ou `errors_count > 0` → vérifier les logs Vercel.

### Alertes automatiques
L'agent envoie déjà sur Telegram :
- Health-check : seulement si 3+ problèmes
- Conflicts-check : seulement si critiques ≥ 3
- Burnout-detect : tous les jours s'il y a des risques
- Daily-backup : toast info chaque jour à 3h
- Weekly-report : tous les lundis 9h (toujours)

---

## 4. Mise à jour de l'agent

### Workflow standard
```bash
# Quand tu as un ordi et veux modifier l'agent
cd ~/dev/cmcteams
git pull

# Modifier ce qu'il faut
nano tools/agent/tasks/health-check.js

# Tester localement
cd tools/agent
source ~/.claude/secrets/kdmc.env
node cli.js health-check

# Push (Vercel redéploie auto)
git add tools/agent/
git commit -m "agent: amélioration health-check"
git push origin main

# Vérifier le déploiement (1 min après push)
# https://vercel.com/<user>/kdmc-agent-monaco/deployments
```

---

## 5. Sauvegarde du repo Git

### GitHub (déjà fait, automatique)
Le repo `9r4rxssx64-creator/cmcteams` est sur GitHub. Si GitHub disparaît un jour (improbable), tu perds tout.

### Mirror sur GitLab (recommandé)
```bash
# 1. Créer compte gratuit https://gitlab.com
# 2. Créer un projet privé "cmcteams-mirror"
# 3. Ajouter en remote
cd ~/dev/cmcteams
git remote add gitlab https://gitlab.com/<user>/cmcteams-mirror.git
git push gitlab main

# 4. Configurer un push automatique sur les 2
git remote set-url --add --push origin https://github.com/9r4rxssx64-creator/cmcteams.git
git remote set-url --add --push origin https://gitlab.com/<user>/cmcteams-mirror.git
# git push origin main → pousse aux 2 en même temps
```

### Mirror local (clé USB chiffrée)
Tous les 3 mois :
```bash
cd ~/Backups
git clone --mirror https://github.com/9r4rxssx64-creator/cmcteams.git cmcteams-$(date +%Y-%m).git
# Copier sur clé USB (chiffrée AES, mot de passe noté)
```

---

## 6. Documentation à maintenir

À jour SYSTÉMATIQUEMENT après chaque changement :

- `~/.claude/CLAUDE.md` — règles globales multi-projets
- `<projet>/CLAUDE.md` — guide assistant projet
- `<projet>/NOTES_USER.md` — infos métier admin
- `<projet>/MEMO_RESUME.md` — état courant
- `<projet>/CHANGELOG.md` — historique versions

Faire un audit doc tous les 3 mois (skill `kdmc-status` aide).

---

## 7. Limites & quotas à surveiller

### Anthropic API
- Dashboard : https://console.anthropic.com/usage
- Alerte si > 80% du budget mensuel défini
- Coût typique agent KDMC : < 1 €/mois (rapports hebdo Haiku)

### Vercel
- Free tier : 100 GB bandwidth, 6000 cron invocations/mois
- L'agent fait **~65 exécutions/mois** (3 crons : quotidien 3 h, quotidien 8 h, hebdo lundi 9 h) → très largement dans le gratuit

### Firebase
- Free tier : 1 GB storage, 10 GB bandwidth/mois
- CMC Teams + agent : reste largement sous quota

### Gmail API
- 1 milliard requêtes/jour (illimité usage normal)

---

## 8. Plan de continuité

### Si Anthropic est down
- L'agent n'envoie pas de rapport hebdo (mais ne crash pas)
- L'app CMC Teams continue de fonctionner (IA tools locaux)

### Si Vercel est down
- L'agent ne tourne plus pendant la durée
- Solution : avoir un mirror sur Railway prêt à activer (15 min)

### Si Firebase est down
- L'app CMC Teams passe en mode localStorage-only
- Pas de sync entre devices pendant la durée
- Données préservées localement, sync au retour

### Si tu perds ton accès Anthropic Console
- Créer nouveau compte → générer nouvelle clé → mettre à jour Vercel + Notes
- Pas de perte de données

### Si tu perds ton ordi
- Sécurise via "Localiser" Apple
- Tous les secrets sont dans Notes iPhone (Face ID)
- Repo GitHub intact
- Re-cloner sur nouveau matériel + restaurer kdmc.env depuis Notes

---

## ✅ Checklist trimestrielle (rappel iPhone)

Tous les 3 mois :
- [ ] Vérifier que `cmc_agent_last_report` dans Firebase est récent (< 24h)
- [ ] Tester l'endpoint Vercel `/api/cron?trigger=manual`
- [ ] Vérifier dashboard Anthropic (consommation OK)
- [ ] Vérifier tokens en expiration (FB short-term, MS_CLIENT_SECRET)
- [ ] Faire un export full backup (skill `cmc-backup`)
- [ ] Mettre à jour Notes iPhone si nouvelle version Token
- [ ] Push mirror Git
- [ ] Audit doc (kdmc-status)

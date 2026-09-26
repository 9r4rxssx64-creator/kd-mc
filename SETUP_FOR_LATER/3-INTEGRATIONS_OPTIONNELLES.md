# 🔌 INTÉGRATIONS OPTIONNELLES — au fil de l'eau

> **Pas urgent**. À activer une par une selon tes besoins.
> Compte 15-30 min par intégration (sauf WhatsApp Business : 1-5 jours d'attente Meta).

---

## 📊 Tableau récapitulatif

| Intégration | Difficulté | Durée setup | Coût | Cas d'usage typique |
|---|---|---|---|---|
| **Gmail** | ⭐⭐ | 20 min | 0 € | Envoyer rapports auto, lire emails clients |
| **Telegram** | ⭐ | 5 min | 0 € | (DÉJÀ FAIT) — notifs agent |
| **Google Drive** | ⭐⭐ | 15 min | 0 € | Backups CMC Teams archivés |
| **Google Calendar** | ⭐⭐ | 15 min | 0 € | Réunions casino, planning shifts |
| **Outlook 365** | ⭐⭐⭐ | 30 min | 0 €* | Calendrier + emails Microsoft (*si tu as Office) |
| **Facebook Pages** | ⭐⭐ | 30 min | 0 € | Publication, stats, réponses messages |
| **Instagram Business** | ⭐⭐ | 30 min | 0 € | Posts, stories, commentaires |
| **WhatsApp Business** | ⭐⭐⭐⭐ | 1-5 jours | 0 € → 30 €/mois | Messages clients massifs (e-commerce) |

---

## 1. Gmail (priorité moyenne)

**Quand l'activer** : tu veux que l'agent t'envoie des rapports par email aussi (en plus de Telegram).

📁 Voir `tools/integrations/gmail/setup.md` pour les détails.

**Étapes résumées** :
1. Aller sur https://console.cloud.google.com
2. Créer projet `KDMC-Integrations`
3. Activer **Gmail API**
4. Créer credentials OAuth Desktop → télécharger `credentials.json`
5. Mettre `credentials.json` dans `tools/integrations/gmail/`
6. Lancer `cd tools/integrations/gmail && npm install && node setup.js`
7. Suivre l'URL → autoriser → coller le code → `token.json` créé
8. Récupérer les 3 valeurs (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) → `~/.claude/secrets/kdmc.env`
9. Ajouter ces 3 vars sur Vercel (dashboard agent)
10. Redéployer Vercel → l'agent peut maintenant envoyer des emails

**Test** :
```bash
cd tools/integrations/gmail
node -e "import('./client.js').then(m=>m.sendEmail('kevind@monaco.mc','Test KDMC','✅ Gmail OAuth fonctionne'))"
```

---

## 2. Google Drive (priorité moyenne)

**Quand l'activer** : tu veux que l'agent fasse les backups quotidiens dans ton Drive (en plus de Firebase).

📁 Voir `tools/integrations/gdrive/setup.md`.

**Étapes résumées** :
1. Réutiliser le projet Google Cloud créé pour Gmail
2. Activer **Google Drive API**
3. Étendre les scopes OAuth pour inclure `drive.file`
4. Re-générer le token (relance `node setup.js`)
5. Créer un dossier `CMC Teams Backups` dans ton Drive
6. Copier l'ID du dossier (URL : `https://drive.google.com/drive/folders/<ID>`)
7. Ajouter `GDRIVE_FOLDER_ID=<ID>` dans `~/.claude/secrets/kdmc.env` + Vercel
8. Modifier `tools/agent/tasks/daily-backup.js` pour appeler `gdrive.uploadFile()` aussi

---

## 3. Google Calendar (priorité basse)

**Quand l'activer** : tu veux automatiser les invitations réunions, sync planning shifts.

📁 Voir `tools/integrations/gcalendar/setup.md`.

Étapes similaires Gmail/Drive (même projet Google Cloud, scope `calendar.events`).

**Cas d'usage** :
- Créer un événement Calendar quand un employé valide un échange de shift
- Notifier les équipes de réunions
- Sync entre planning CMC et calendrier perso Kevin

---

## 4. Outlook 365 (priorité basse)

**Quand l'activer** : tu utilises Microsoft 365 pro et veux sync avec ton Outlook entreprise.

📁 Voir `tools/integrations/outlook/setup.md`.

**Étapes** :
1. Azure Portal (https://portal.azure.com)
2. App Registrations → New
3. Permissions : `Calendars.ReadWrite` + `Mail.Send`
4. Admin consent (peut nécessiter Helpdesk SBM si compte pro)
5. Créer client secret → noter `tenant_id` + `client_id` + `client_secret`
6. Variables env : `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_USER_ID=kevind@monaco.mc`

---

## 5. Facebook Pages (priorité selon usage)

**Quand l'activer** : tu as une page Facebook business à automatiser.

📁 Voir `tools/integrations/facebook/setup.md`.

**Étapes résumées** :
1. https://developers.facebook.com → My Apps → Create App
2. Type : **Business**
3. Ajouter produit "Facebook Login" + "Pages API"
4. Générer un Page Access Token longue durée (60j, échangeable)
5. Permissions : `pages_manage_posts`, `pages_messaging`, `pages_read_engagement`
6. Variables env : `FB_PAGE_ID`, `FB_PAGE_TOKEN`

**Note** : tu ne peux PAS automatiser ton profil personnel Facebook, uniquement des pages business.

---

## 6. Instagram Business (priorité selon usage)

**Quand l'activer** : tu as un compte Instagram Business lié à une page Facebook.

📁 Voir `tools/integrations/instagram/setup.md`.

**Pré-requis** :
- Compte Instagram en mode **Business** (pas Personal)
- Lié à une page Facebook (étape Meta Business Suite)

Réutilise l'app Meta Developer créée pour Facebook (token partagé).

---

## 7. WhatsApp Business (le plus complexe)

**Quand l'activer** : si tu fais de l'e-commerce (e-KDMC) et veux notifier les clients.

📁 Voir `tools/integrations/whatsapp/setup.md`.

**Étapes** :
1. WhatsApp Business Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api)
2. Créer une app Meta dédiée
3. **Vérification numéro WhatsApp Business** (1-5 jours côté Meta)
4. Créer un utilisateur système → token PERMANENT (pas 60j)
5. Templates messages à approuver Meta (24-72h)
6. Webhook si tu veux recevoir les réponses
7. Variables env : `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`

**Coût** :
- 1000 conversations gratuites/mois
- Au-delà : 0,03-0,06 €/conversation selon pays

⚠️ Pas avant le démarrage du projet **e-KDMC** (commerce en ligne).

---

## 🎯 Ordre recommandé d'activation

Pour Kevin avec son contexte :

1. ✅ **Telegram** (déjà fait sur Android)
2. ✅ **Gmail** (utile pour rapports + lecture emails clients perso)
3. ✅ **Google Drive** (backups durables)
4. ⏸ **Google Calendar** (quand tu veux sync planning casino)
5. ⏸ **Outlook 365** (si compte SBM Outlook utilisé)
6. ⏸ **Facebook Pages** (si tu as une page Casino ou perso pro)
7. ⏸ **Instagram Business** (si présence Insta business)
8. ⏸ **WhatsApp Business** (uniquement quand e-KDMC démarre)

---

## 📦 Après chaque intégration

```bash
# 1. Mettre à jour ~/.claude/secrets/kdmc.env avec les nouvelles vars
nano ~/.claude/secrets/kdmc.env

# 2. Mettre à jour Vercel dashboard avec les mêmes vars
# https://vercel.com/<user>/kdmc-agent/settings/environment-variables

# 3. Redéployer Vercel (Settings > Deployments > Redeploy)

# 4. Tester en local
cd tools/integrations/<intégration>
node -e "import('./client.js').then(...)"

# 5. Mettre à jour tools/agent/tasks/<task>.js si tu veux que l'agent
#    utilise cette intégration automatiquement
```

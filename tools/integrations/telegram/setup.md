# Setup Telegram Bot — Guide pas à pas (Kevin)

Ce guide configure un bot Telegram personnel pour recevoir des notifications
CMCteams (alertes admin, backups, demandes urgentes) et exécuter des commandes
depuis ton iPhone.

> Durée estimée : **5 minutes**. À faire UNE seule fois.

---

## 1. Créer le bot via @BotFather

1. Ouvrir Telegram (mobile ou desktop)
2. Chercher **@BotFather** (compte officiel avec coche bleue)
3. Démarrer la conversation : `/start`
4. Taper : `/newbot`
5. BotFather demande un **nom** affiché : par exemple `KDMC Admin Bot`
6. Puis un **username** unique terminant par `bot` : par exemple `kdmc_admin_bot`
7. BotFather répond avec ton **token** :
   ```
   123456789:AAH-abc...xyz
   ```
   ⚠️ **C'est ton mot de passe — ne le partage JAMAIS.**

## 2. Récupérer ton chat_id (TELEGRAM_CHAT_ID)

Le chat_id permet au bot de t'envoyer des messages en privé.

1. Sur Telegram, chercher **@userinfobot**
2. Démarrer la conversation : `/start`
3. Le bot répond avec ton ID, ex :
   ```
   Id: 987654321
   First: Kevin
   Lang: fr
   ```
4. Note l'**Id** (c'est ton `TELEGRAM_CHAT_ID`)

## 3. Démarrer une conversation avec ton bot

⚠️ **Important** : avant que ton bot puisse t'envoyer des messages, tu dois
lui parler en premier (Telegram bloque les messages bot→user sinon).

1. Cherche ton bot par username (ex `@kdmc_admin_bot`)
2. Clique **DÉMARRER** ou tape `/start`

## 4. Configurer les variables d'environnement

Ajouter à `~/.bashrc` ou `~/.zshrc` :

```bash
export TELEGRAM_BOT_TOKEN="123456789:AAH-abc...xyz"
export TELEGRAM_CHAT_ID="987654321"
```

Recharger : `source ~/.bashrc`

## 5. Installer + tester

```bash
cd /home/user/CMCteams/tools/integrations/telegram
npm install
node -e "import('./client.js').then(m=>m.sendMessage('🚀 Bot KDMC opérationnel !'))"
```

Tu dois recevoir le message sur Telegram instantanément.

---

## Variables d'environnement requises

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token du bot (depuis @BotFather) |
| `TELEGRAM_CHAT_ID` | Ton chat_id personnel (depuis @userinfobot) |

## Cas d'usage prévus

- Notifications admin CMCteams (nouveau planning importé, demande d'échange…)
- Backup automatique JSON envoyé en pièce jointe
- Commandes rapides : `/online`, `/today`, `/absences`
- Alertes sécurité : tentative d'accès admin, échec PIN…

## Sécurité

- Le token bot est équivalent à un mot de passe → JAMAIS dans un commit/repo/log
- Si compromis : @BotFather → `/revoke` puis `/token` pour en générer un nouveau
- Le bot ne peut écrire qu'aux utilisateurs qui l'ont démarré
- Pour limiter qui peut commander le bot : vérifier `chatId === process.env.TELEGRAM_CHAT_ID`
  dans le callback `onMessage` (déjà fait par défaut dans client.js)

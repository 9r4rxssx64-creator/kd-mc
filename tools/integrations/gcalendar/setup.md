# Setup — Google Calendar (kdmc-gcalendar)

Module d'intégration Google Calendar pour CMCteams.

## 1. Pré-requis

- Compte Google (perso ou Workspace)
- Node.js >= 18
- Si tu as déjà le module **gmail** ou **gdrive**, **réutilise le même `client_id` / `client_secret`** en ajoutant simplement le scope Calendar au consent screen.

## 2. Google Cloud Console

1. https://console.cloud.google.com/ -> sélectionner ton projet (`kdmc-cmcteams`)
2. **APIs & Services -> Library** -> activer **Google Calendar API**
3. **OAuth consent screen** -> ajouter scope :
   - `https://www.googleapis.com/auth/calendar.events`
4. **Credentials** :
   - Si déjà une OAuth client ID "Desktop" existe -> réutiliser
   - Sinon **Create Credentials -> OAuth client ID -> Desktop app**

## 3. Variables d'environnement

```bash
export GOOGLE_CLIENT_ID="xxxxxxxx.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"
export GOOGLE_REDIRECT_URI="http://localhost:3000/oauth2callback"
export GOOGLE_OAUTH_TOKEN='{"access_token":"...","refresh_token":"...","scope":"https://www.googleapis.com/auth/calendar.events","token_type":"Bearer","expiry_date":1234567890000}'

# Optionnel :
export GCAL_CALENDAR_ID="primary"            # ou id d'un calendrier secondaire
export GCAL_TIMEZONE="Europe/Monaco"         # default = Europe/Monaco
```

> **NE JAMAIS** committer ces variables (fichier `.env` gitignored, ou export shell).

## 4. Obtenir GOOGLE_OAUTH_TOKEN

Même script que gdrive (voir `../gdrive/setup.md` section 4) mais avec le scope :

```js
scope: ["https://www.googleapis.com/auth/calendar.events"]
```

Si tu as déjà un token avec Drive + Gmail, tu peux **relancer l'OAuth avec les 3 scopes cumulés** :

```js
scope: [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
]
```

-> un seul `GOOGLE_OAUTH_TOKEN` à gérer.

## 5. Identifier un Calendar ID secondaire

1. Ouvrir https://calendar.google.com
2. Paramètres -> sélectionner le calendrier -> **Intégrer le calendrier**
3. Copier l'**Identifiant du calendrier** (ex: `xxx@group.calendar.google.com`)
4. `export GCAL_CALENDAR_ID="xxx@group.calendar.google.com"`

## 6. Test rapide

```bash
cd tools/integrations/gcalendar
npm install
node -e "import('./client.js').then(async m => { console.log(await m.getEventsToday()); })"
```

## 7. Sécurité

- Scope `calendar.events` : l'app peut **lire/écrire les événements** mais **pas modifier le calendrier lui-même** (settings, ACL)
- `refresh_token` permanent jusqu'à révocation manuelle
- Révocation : https://myaccount.google.com/permissions

# Setup — Google Drive (kdmc-gdrive)

Module d'intégration Google Drive pour CMCteams (Kevin DESARZENS / U11804).

## 1. Pré-requis

- Compte Google (perso ou Workspace)
- Node.js >= 18
- Si tu as déjà fait l'OAuth pour le module **gmail**, tu peux **réutiliser le même `client_id` / `client_secret`**, il suffit d'**ajouter le scope Drive** au consent screen.

## 2. Google Cloud Console

1. Aller sur https://console.cloud.google.com/
2. Créer/sélectionner un projet (ex: `kdmc-cmcteams`)
3. **APIs & Services -> Library** -> activer **Google Drive API**
4. **OAuth consent screen** :
   - User type : External (ou Internal si Workspace)
   - Ajouter scope : `https://www.googleapis.com/auth/drive.file`
   - Ajouter ton email comme **test user** (kevind@monaco.mc)
5. **Credentials** -> **Create Credentials** -> **OAuth client ID** :
   - Type : **Desktop app** (le plus simple)
   - Note les `client_id` et `client_secret`

## 3. Variables d'environnement

```bash
export GOOGLE_CLIENT_ID="xxxxxxxx.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"
export GOOGLE_REDIRECT_URI="http://localhost:3000/oauth2callback"
export GOOGLE_OAUTH_TOKEN='{"access_token":"...","refresh_token":"...","scope":"https://www.googleapis.com/auth/drive.file","token_type":"Bearer","expiry_date":1234567890000}'
```

> **NE JAMAIS** committer ces variables. Utiliser un fichier `.env` local (gitignored) ou la commande `export`.

## 4. Obtenir GOOGLE_OAUTH_TOKEN (premier flow)

Le module Gmail a un script `setup.js`. Si tu ne l'as pas, voici un script minimal :

```js
// setup-oauth.js (à lancer une fois localement)
import { google } from "googleapis";
import http from "node:http";
import open from "open"; // npm i open

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/oauth2callback"
);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive.file"],
});
console.log("Ouvre :", url);
open(url);
http.createServer(async (req, res) => {
  const code = new URL(req.url, "http://localhost:3000").searchParams.get("code");
  const { tokens } = await oauth2.getToken(code);
  console.log("\nGOOGLE_OAUTH_TOKEN=" + JSON.stringify(tokens));
  res.end("OK, token affiche dans la console.");
  process.exit(0);
}).listen(3000);
```

Puis copier la valeur affichée dans `GOOGLE_OAUTH_TOKEN`.

## 5. Test rapide

```bash
cd tools/integrations/gdrive
npm install
node -e "import('./client.js').then(async m => { console.log(await m.listFiles()); })"
```

## 6. Sécurité

- Le scope `drive.file` est **restreint** : l'app ne voit que les fichiers qu'elle crée/ouvre. Bonne pratique RGPD.
- Le `refresh_token` permet de régénérer l'`access_token` automatiquement (pas besoin de relancer le flow tous les jours).
- Si tu révoques l'autorisation : https://myaccount.google.com/permissions

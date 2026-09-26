# Setup Gmail API — Guide pas à pas (Kevin)

Ce guide configure l'accès Gmail via OAuth 2.0 pour le compte `kevind@monaco.mc`
(ou tout autre compte Google que tu veux exposer à CMCteams / scripts personnels).

> Durée estimée : **10 minutes**. À faire UNE seule fois.

---

## 1. Créer le projet Google Cloud

1. Aller sur https://console.cloud.google.com/
2. En haut, cliquer sur le sélecteur de projet → **NOUVEAU PROJET**
3. Nom : `KDMC-Gmail` (ou ce que tu veux)
4. Organisation : laisser vide (compte perso) ou `monaco.mc` si dispo
5. Cliquer **CRÉER**

## 2. Activer l'API Gmail

1. Dans le menu de gauche : **APIs et services** → **Bibliothèque**
2. Chercher `Gmail API`
3. Cliquer dessus → **ACTIVER**

## 3. Configurer l'écran de consentement OAuth

1. **APIs et services** → **Écran de consentement OAuth**
2. Type d'utilisateur : **Externe** → **CRÉER**
3. Remplir :
   - Nom de l'application : `KDMC Gmail`
   - Email d'assistance utilisateur : `kevind@monaco.mc`
   - Email du développeur : `kevind@monaco.mc`
4. **ENREGISTRER ET CONTINUER**
5. Étape "Champs d'application" : **AJOUTER OU SUPPRIMER DES CHAMPS**
   - Cocher : `https://www.googleapis.com/auth/gmail.modify`
   - (Permet lecture + envoi + modification des emails)
6. **METTRE À JOUR** → **ENREGISTRER ET CONTINUER**
7. Étape "Utilisateurs de test" : **AJOUTER DES UTILISATEURS**
   - Ajouter `kevind@monaco.mc`
8. **ENREGISTRER ET CONTINUER** → **REVENIR AU TABLEAU DE BORD**

## 4. Créer les credentials OAuth Desktop

1. **APIs et services** → **Identifiants**
2. **+ CRÉER DES IDENTIFIANTS** → **ID client OAuth**
3. Type d'application : **Application de bureau**
4. Nom : `KDMC Desktop CLI`
5. **CRÉER** → **TÉLÉCHARGER LE JSON**
6. Renommer le fichier en `credentials.json`
7. Le placer ici : `/home/user/CMCteams/tools/integrations/gmail/credentials.json`

> ⚠️ **JAMAIS** commit ce fichier. Il est dans `.gitignore`.

## 5. Lancer le setup OAuth

```bash
cd /home/user/CMCteams/tools/integrations/gmail
npm install
node setup.js
```

Le script va :
1. Lire `credentials.json`
2. Afficher une URL → copier-coller dans ton navigateur
3. Te connecter avec `kevind@monaco.mc`
4. Cliquer "Continuer" sur l'écran d'avertissement (app non vérifiée → c'est normal, c'est ton appli)
5. Autoriser l'accès Gmail
6. Copier le **code** affiché → coller dans le terminal
7. Le script sauvegarde `token.json` (refresh_token persistant)

## 6. Stocker le refresh_token en variable d'environnement

Une fois `token.json` créé, copier la valeur de `refresh_token` :

```bash
cat token.json | grep refresh_token
```

Puis ajouter à ton `~/.bashrc` ou `~/.zshrc` :

```bash
export GMAIL_REFRESH_TOKEN="1//0g..."
export GMAIL_CLIENT_ID="123-abc.apps.googleusercontent.com"
export GMAIL_CLIENT_SECRET="GOCSPX-..."
```

(Les `CLIENT_ID` et `CLIENT_SECRET` sont dans `credentials.json`.)

Recharger : `source ~/.bashrc`

## 7. Tester

```bash
node -e "import('./client.js').then(m=>m.readRecentEmails(5).then(r=>console.log(JSON.stringify(r,null,2))))"
```

Tu dois voir tes 5 derniers emails.

---

## Variables d'environnement requises

| Variable | Description |
|----------|-------------|
| `GMAIL_CLIENT_ID` | OAuth Client ID (depuis credentials.json) |
| `GMAIL_CLIENT_SECRET` | OAuth Client Secret |
| `GMAIL_REFRESH_TOKEN` | Refresh token (depuis token.json) |

Le `client.js` peut aussi lire automatiquement `token.json` et `credentials.json`
si les variables d'env ne sont pas définies.

## Sécurité

- `credentials.json` et `token.json` sont gitignorés
- Ne JAMAIS partager le `refresh_token` (équivalent à un mot de passe permanent)
- Pour révoquer : https://myaccount.google.com/permissions

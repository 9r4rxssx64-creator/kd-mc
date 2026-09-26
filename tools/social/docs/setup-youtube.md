# Setup YouTube Data API v3

> Guide étape par étape pour obtenir les credentials YouTube API.
> Temps estimé : 15 minutes.

## Pourquoi YouTube en priorité ?

- **RPM 100x supérieur** aux Shorts (long-form $4-15 vs Shorts $0.01-0.05)
- **AdSense fiable** (paiements mensuels via virement)
- **API gratuite** (10,000 quota units/jour suffisent pour ~6 uploads)
- **Long-form + Shorts** depuis le même compte

## Pré-requis

- Compte Google
- Chaîne YouTube créée (peut être faite via youtube.com → "Créer une chaîne")
- Carte bancaire pour Google Cloud (sans frais — juste vérification)

## Étapes

### 1. Créer un projet Google Cloud

1. Aller sur https://console.cloud.google.com/
2. Cliquer "Sélectionner un projet" → "NOUVEAU PROJET"
3. Nom : `KDMC-Social-Video`
4. Cliquer "CRÉER"

### 2. Activer YouTube Data API v3

1. Dans le menu : "API et services" → "Bibliothèque"
2. Rechercher "YouTube Data API v3"
3. Cliquer dessus → "ACTIVER"

### 3. Configurer l'écran de consentement OAuth

1. "API et services" → "Écran de consentement OAuth"
2. Type d'utilisateur : **Externe** → CRÉER
3. Remplir :
   - Nom de l'app : `KDMC Social Video`
   - Email d'assistance utilisateur : votre email
   - Coordonnées du développeur : votre email
4. ENREGISTRER ET CONTINUER
5. Champs d'application : ne rien ajouter pour l'instant → ENREGISTRER ET CONTINUER
6. Utilisateurs de test : **AJOUTER VOTRE EMAIL Google** (celui de la chaîne YouTube)
7. ENREGISTRER ET CONTINUER → REVENIR AU TABLEAU DE BORD

### 4. Créer les credentials OAuth 2.0

1. "API et services" → "Identifiants" → "+ CRÉER DES IDENTIFIANTS" → "ID client OAuth"
2. Type d'application : **Application de bureau**
3. Nom : `KDMC CLI`
4. CRÉER
5. **TÉLÉCHARGER LE JSON** (ou copier Client ID + Client Secret)

### 5. Obtenir le Refresh Token

C'est l'étape "compliquée" mais elle se fait une fois pour toujours.

```bash
# Installer le helper si pas déjà fait
cd /home/user/CMCteams/tools/social
npm install

# Lancer le script d'auth (à créer)
node scripts/auth-youtube.js
```

Le script va :
1. Ouvrir une URL dans votre navigateur
2. Vous connecter avec votre compte Google (celui de la chaîne YouTube)
3. Accepter les permissions
4. Récupérer un code → afficher le `refresh_token`

### 6. Stocker les credentials

```bash
# Éditer ~/.claude/secrets/cmcteams.env
mkdir -p ~/.claude/secrets
cat >> ~/.claude/secrets/cmcteams.env <<EOF
export YOUTUBE_CLIENT_ID="XXXXXXX.apps.googleusercontent.com"
export YOUTUBE_CLIENT_SECRET="GOCSPX-XXXXX"
export YOUTUBE_REFRESH_TOKEN="1//XXXXX"
EOF

# Charger
source ~/.claude/secrets/cmcteams.env
```

### 7. Tester

```bash
node cli.js publish --platform youtube --video output/fact-short-001/fact-short-001_short.mp4 --title "Test" --description "Premier test"
```

## Limites & quotas

- **10,000 quota units/jour** (réinitialisation 9h matin Pacific Time)
- Un upload coûte ~1600 units → **6 uploads/jour max**
- Vidéo max : **128 GB** ou **12h**
- Format : MP4 H.264 + AAC

## Sécurité

- Le refresh token n'expire pas (sauf révocation manuelle)
- En cas de fuite : revenir sur Google Cloud Console → Identifiants → Régénérer
- Les uploads peuvent être marqués "Brouillon" (`privacyStatus: "private"`) pour validation manuelle avant publication

## Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `403 forbidden` | API non activée | Étape 2 |
| `invalid_grant` | Refresh token expiré | Refaire étape 5 |
| `quotaExceeded` | 10K units atteints | Attendre minuit Pacific |
| `invalid_request` | Mauvaise vidéo | Vérifier format MP4 |

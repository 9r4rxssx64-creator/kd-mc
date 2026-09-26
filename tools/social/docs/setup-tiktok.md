# Setup TikTok Content Posting API

> Guide pour obtenir les credentials TikTok API.
> ⚠ **Attention** : la review TikTok prend 2-4 semaines. Commencer en mode SANDBOX.

## Pourquoi TikTok ?

- Croissance rapide d'audience (mais monétisation limitée : Creator Fund $0.02-0.04/1000 vues)
- Excellent pour redirigez vers YouTube long-form (où l'argent se fait)
- Audience jeune et engagée

## Pré-requis

- Compte TikTok normal
- Email professionnel
- ⚠ Le **TikTok For Business** account est facultatif au début

## Étapes

### 1. Créer un compte développeur

1. Aller sur https://developers.tiktok.com
2. Cliquer "Login" → utiliser votre compte TikTok
3. Accepter les ToS développeur

### 2. Créer une app

1. "Manage apps" → "Create new app"
2. Remplir :
   - App name : `KDMC Social Video`
   - App description : `Automated video publishing for KDMC content`
   - Category : `Productivity` ou `Entertainment`
   - Platform : `Web`
3. Sauvegarder → vous obtenez :
   - `Client Key` (équivalent App ID)
   - `Client Secret`

### 3. Configurer les permissions

Dans l'app, onglet "Add Products" → ajouter :
- ✅ **Login Kit** (pour OAuth)
- ✅ **Content Posting API** (pour publier)

Pour Content Posting :
- Scope demandé : `video.upload` + `video.publish`
- Mode : **Sandbox** au début (publie dans l'inbox du créateur, pas direct)

### 4. URL de redirection OAuth

- Dans "Login Kit" → Redirect URI : `http://localhost:8000/tiktok/callback`
- Sauvegarder

### 5. Obtenir le token OAuth

```bash
node scripts/auth-tiktok.js
```

Le script va :
1. Ouvrir l'URL OAuth dans le navigateur
2. Vous demandez d'autoriser l'app
3. Récupérer le code → échanger contre `access_token` + `refresh_token`

### 6. Stocker

```bash
cat >> ~/.claude/secrets/cmcteams.env <<EOF
export TIKTOK_CLIENT_KEY="awXXXXXXX"
export TIKTOK_CLIENT_SECRET="XXXXXXX"
export TIKTOK_ACCESS_TOKEN="act.XXXXXXX"
export TIKTOK_REFRESH_TOKEN="rt.XXXXXXX"
EOF
source ~/.claude/secrets/cmcteams.env
```

### 7. Demander la review (pour passer en production)

Dans l'app TikTok → "Submit for review" :
- Décrire votre cas d'usage
- Fournir une démo vidéo (10-30s)
- Attendre 2-4 semaines

En attendant : mode SANDBOX = vidéos arrivent dans VOTRE inbox TikTok pour publication manuelle (équivalent à un brouillon).

## Limites & quotas

- **Sandbox** : 6 uploads/jour, post-to-inbox uniquement
- **Production** : limites plus élevées après review
- Format : 9:16 vertical, MP4 H.264, max 287 MB
- Durée : 10 secondes minimum, 10 minutes maximum

## Sécurité

- `access_token` expire après ~24h → utiliser `refresh_token` pour renouveler
- Stocker uniquement dans `~/.claude/secrets/`

## Alternative : TikTok via copier-coller manuel

Si la setup API te bloque trop longtemps :
1. Génère la vidéo localement
2. Reçois-la via Telegram (`--send-telegram`)
3. Upload manuel sur l'app TikTok

→ moins automatisé mais commence à publier rapidement

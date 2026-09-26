# Setup X / Twitter API v2

> Guide pour publier des vidéos sur X.

## Pré-requis

- Compte X / Twitter
- ⚠ **Tier Basic ou plus** ($100/mois) — le tier Free n'autorise QUE 17 posts/jour avec restrictions
- Carte bancaire pour Stripe (paiement Basic)

## Décision : payer ou pas ?

| Tier | Coût | Capacités | Conseil |
|------|------|-----------|---------|
| **Free** | $0 | 17 tweets/jour, pas de média ≥ 5MB | ❌ Inutile pour vidéos |
| **Basic** | $100/mois | 50K tweets/mois, média jusqu'à 512 MB | ✅ Si tu vises X comme plateforme principale |
| **Pro** | $5000/mois | Inutile pour notre usage | ❌ |

**Recommandation** : skip X tant que tu n'as pas validé qu'il y a une vraie audience pour toi sur cette plateforme. Tu peux toujours poster manuellement les meilleurs clips.

## Étapes (si tu décides de payer)

### 1. Créer le projet

1. https://developer.x.com → Sign in
2. Souscrire au tier **Basic** ($100/mois)
3. Créer un nouveau projet : `KDMC Social Video`

### 2. Créer une app

1. Dans le projet → "Add app"
2. App name : `KDMC Video Bot`
3. Récupérer :
   - `API Key` (Consumer Key)
   - `API Secret`
   - `Bearer Token`

### 3. Activer User Authentication Settings

1. Dans l'app → "User authentication settings" → Set up
2. **App permissions** : Read and write
3. **Type of App** : Web App
4. Callback URI : `http://localhost:8000/twitter/callback`
5. Sauvegarder

### 4. Obtenir Access Token + Secret

```bash
node scripts/auth-twitter.js
```

OU via le tableau de bord X :
1. Dans l'app → "Keys and tokens" → "Access Token and Secret" → Generate
2. Copier les 2 valeurs

### 5. Stocker

```bash
cat >> ~/.claude/secrets/cmcteams.env <<EOF
export TWITTER_API_KEY="XXXXXXX"
export TWITTER_API_SECRET="XXXXXXX"
export TWITTER_ACCESS_TOKEN="XXXXXXX-XXXXXXX"
export TWITTER_ACCESS_SECRET="XXXXXXX"
export TWITTER_BEARER_TOKEN="AAAAA..."
EOF
source ~/.claude/secrets/cmcteams.env
```

## Limites & quotas

- 50,000 tweets/mois
- Média : 512 MB max
- Vidéo : 140s max, MP4 H.264 + AAC
- Rate limit : 300 tweets / 3h

## Sécurité

- OAuth 1.0a obligatoire pour upload media (pas OAuth 2.0)
- Tokens permanents (pas d'expiration sauf révocation)

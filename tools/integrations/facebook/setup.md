# Setup — Facebook Pages API

Guide d'obtention d'un **Page Access Token** longue durée pour l'intégration CMCteams.

## 1. Pré-requis

- Un compte Facebook personnel (Kevin DESARZENS).
- Une **Page Facebook** dont vous êtes administrateur (ex : "Casino de Monte-Carlo - Black Jack").
- Un compte **Meta Business Suite** : <https://business.facebook.com>.

## 2. Créer une App Meta Developer

1. Aller sur <https://developers.facebook.com/apps/>.
2. **Créer une app** -> Type **Business** -> Nom : `CMCteams-Social`.
3. Dans le tableau de bord de l'app, ajouter le produit **Facebook Login for Business** ET **Pages API**.

## 3. Récupérer un User Access Token court

1. Ouvrir le **Graph API Explorer** : <https://developers.facebook.com/tools/explorer/>.
2. Sélectionner votre app `CMCteams-Social`.
3. Cliquer **Generate Access Token** avec les permissions :
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_manage_metadata`
   - `pages_messaging`
   - `pages_read_user_content`
   - `read_insights`
4. Copier le token court (~1h de validité).

## 4. Échanger contre un User Token longue durée (60 jours)

```bash
curl -s "https://graph.facebook.com/v20.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=APP_ID&\
client_secret=APP_SECRET&\
fb_exchange_token=SHORT_USER_TOKEN"
```

## 5. Récupérer le Page Access Token PERMANENT

```bash
curl -s "https://graph.facebook.com/v20.0/me/accounts?access_token=LONG_USER_TOKEN"
```

La réponse contient les pages administrées avec leur `access_token` (qui n'expire JAMAIS tant que le User Token longue durée reste valide).

Noter :
- `FB_PAGE_ID` : id numérique de la page
- `FB_PAGE_TOKEN` : token permanent de la page

## 6. Configuration locale (jamais commitée)

Créer `~/.claude/secrets/cmcteams.env` :

```bash
export FB_PAGE_ID="123456789012345"
export FB_PAGE_TOKEN="EAAB...long-permanent-token..."
```

Puis `source ~/.claude/secrets/cmcteams.env` avant utilisation.

## 7. Vérification

```bash
curl -s "https://graph.facebook.com/v20.0/$FB_PAGE_ID?fields=name,fan_count&access_token=$FB_PAGE_TOKEN"
```

Doit retourner `{"name":"...","fan_count":N,"id":"..."}`.

## 8. Limites & quotas

- **Taux** : 200 appels / heure / utilisateur (App-level rate limit).
- **Posts média** : doivent être HTTPS publiques (URL accessible par Meta).
- **Insights** : minimum 28 jours de page existante.

## 9. Sécurité

- **Ne jamais** committer le token dans le repo CMCteams.
- Stocker dans `~/.claude/secrets/` (cf. règle globale).
- En cas de fuite : régénérer immédiatement via le Graph Explorer (révoque l'ancien).

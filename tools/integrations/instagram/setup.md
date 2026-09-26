# Setup — Instagram Business via Graph API

## Pré-requis CRITIQUE

Instagram Graph API exige un **compte Instagram Business** (ou Creator) **lié
à une Page Facebook** dont vous êtes administrateur. Un compte personnel ne
fonctionne PAS.

## 1. Convertir le compte Instagram en Business

1. App Instagram mobile -> Profil -> Menu -> **Paramètres** -> **Compte**
2. **Passer à un compte professionnel** -> choisir **Entreprise**
3. Renseigner catégorie : "Casino / Hôtellerie de luxe"

## 2. Lier le compte Instagram à la Page Facebook

1. Aller dans **Meta Business Suite** : <https://business.facebook.com>
2. **Paramètres** -> **Comptes** -> **Comptes Instagram**
3. **Ajouter un compte** -> se connecter avec les identifiants Instagram
4. Lier à la page FB existante (ex : "Casino de Monte-Carlo - Black Jack")

## 3. Activer Instagram dans l'app Meta Developer

1. Reprendre l'app `CMCteams-Social` créée pour Facebook (cf. `../facebook/setup.md`)
2. Ajouter le produit **Instagram Graph API**
3. Permissions à demander dans le Graph API Explorer :
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_comments`
   - `instagram_manage_insights`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`

## 4. Récupérer l'IG_USER_ID

L'IG_USER_ID est différent de l'identifiant Instagram public. Il s'obtient via
la Page FB liée :

```bash
# Récupérer la liste des pages
curl -s "https://graph.facebook.com/v20.0/me/accounts?access_token=$LONG_USER_TOKEN"

# Pour chaque page, récupérer l'instagram_business_account
curl -s "https://graph.facebook.com/v20.0/$FB_PAGE_ID?fields=instagram_business_account&access_token=$FB_PAGE_TOKEN"
```

Réponse :

```json
{
  "instagram_business_account": { "id": "17841401234567890" },
  "id": "FB_PAGE_ID"
}
```

Le champ `instagram_business_account.id` = `IG_USER_ID`.

## 5. Configuration locale

Ajouter dans `~/.claude/secrets/cmcteams.env` :

```bash
export IG_USER_ID="17841401234567890"
# Le token est partagé avec Facebook : FB_PAGE_TOKEN
export IG_ACCESS_TOKEN="$FB_PAGE_TOKEN"
```

## 6. Vérification

```bash
curl -s "https://graph.facebook.com/v20.0/$IG_USER_ID?fields=username,followers_count&access_token=$IG_ACCESS_TOKEN"
```

## 7. Limites importantes

- **Posts** : max **25 par jour** par compte IG.
- **Stories** : max **50 par jour**.
- **Médias** : URL HTTPS publique, image JPEG <8MB, vidéo MP4 <100MB.
- **Format image** : ratio entre 4:5 et 1.91:1 (sinon rejet).
- **Workflow publication** : 2 étapes
  1. `POST /{ig-user-id}/media` -> retourne un `creation_id`
  2. `POST /{ig-user-id}/media_publish` avec ce `creation_id`

## 8. Sécurité

- Token = `FB_PAGE_TOKEN` partagé. Mêmes règles : jamais commit.
- Webhooks Instagram (commentaires temps réel) : possibilité d'ajout futur.

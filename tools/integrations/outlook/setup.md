# Setup — Outlook / Microsoft 365 (kdmc-outlook)

Module d'intégration Outlook Calendar + Mail via Microsoft Graph API.

## 1. Pré-requis

- Compte Microsoft 365 / Azure AD (perso ou SBM)
- Node.js >= 18
- Accès au portail Azure : https://portal.azure.com

## 2. Azure Portal — App Registration

1. Portal Azure -> **Azure Active Directory** (ou **Entra ID**) -> **App registrations** -> **New registration**
2. Nom : `kdmc-cmcteams-outlook`
3. Supported account types :
   - **Accounts in this organizational directory only** (si compte SBM)
   - **Personal Microsoft accounts** (si compte perso outlook.com)
4. Redirect URI : laisser vide pour app-only, ou `http://localhost:3000/callback` pour user-delegated
5. **Register**

-> Récupérer :
- **Application (client) ID** -> `MS_CLIENT_ID`
- **Directory (tenant) ID** -> `MS_TENANT_ID`

## 3. Créer un client secret

1. Dans l'app -> **Certificates & secrets** -> **New client secret**
2. Description : `kdmc-cmcteams-prod`, Expires : 24 mois
3. **Copier immédiatement la valeur (Value)** -> `MS_CLIENT_SECRET`
   > Cette valeur ne sera plus affichée après.

## 4. Permissions API

Dans l'app -> **API permissions** -> **Add a permission** -> **Microsoft Graph** -> **Application permissions** (app-only) :

| Permission | Utilité |
|------------|---------|
| `Calendars.ReadWrite` | Créer/lire/modifier événements |
| `Mail.Send` | Envoyer des mails |
| `User.Read.All` | (optionnel) lister users tenant |

Puis **Grant admin consent for <tenant>** (nécessite compte admin Azure).

> **Alternative user-delegated** (si pas admin) : choisir **Delegated permissions** + faire un flow OAuth interactif. Dans ce cas, remplacer `ClientSecretCredential` par `InteractiveBrowserCredential` ou `DeviceCodeCredential`. Voir `@azure/identity` docs.

## 5. Variables d'environnement

```bash
export MS_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export MS_CLIENT_ID="yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
export MS_CLIENT_SECRET="zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
export MS_USER_ID="kevind@monaco.mc"       # UPN ou objectId — requis en app-only
export MS_TIMEZONE="Romance Standard Time"  # optionnel (Monaco/Paris par defaut)
```

> **NE JAMAIS** committer (.env gitignored).

### Formats de timezone Graph (exemples)

- `Romance Standard Time` (Monaco / Paris / Madrid)
- `W. Europe Standard Time`
- `UTC`

Liste complète : https://learn.microsoft.com/en-us/graph/api/outlookuser-supportedtimezones

## 6. Test rapide

```bash
cd tools/integrations/outlook
npm install
node -e "import('./client.js').then(async m => { console.log(await m.listEvents(7)); })"
```

## 7. Sécurité

- Le `client_secret` a une **date d'expiration** : prévoir rotation 2 ans (noter dans calendrier !)
- En app-only, toute action est faite **au nom de l'app** (pas de prompt utilisateur). Attention : la permission s'applique à **tout le tenant** -> privilégier user-delegated si possible.
- Audit Azure : Portal -> Audit logs (toute action Graph est tracée)
- Révoquer en urgence : Portal -> App registration -> **Delete**

## 8. Troubleshooting

| Erreur | Cause / fix |
|--------|-------------|
| `AADSTS70011 invalid scope` | Mauvaise permission Graph, regranter admin consent |
| `Forbidden (403)` | Permission manquante ou admin consent non accordé |
| `ResourceNotFound` sur `/users/{id}` | `MS_USER_ID` inexact (utiliser UPN complet) |
| `Invalid timezone` | Utiliser un nom Windows (pas IANA) — voir section 5 |

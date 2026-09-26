# Setup — WhatsApp Business Cloud API (DÉTAILLÉ)

WhatsApp Business **Cloud API** (hébergée par Meta) est **gratuite jusqu'à
1 000 conversations / mois** (toutes catégories confondues : marketing,
utility, authentication, service). Au-delà, facturation par conversation
(tarifs Monaco / France ~ 0,06 € à 0,15 €).

> Une "conversation" = fenêtre de 24h ouverte avec un utilisateur unique
> (que ce soit un message à l'initiative du business ou de l'utilisateur).

## 1. Pré-requis matériels

- **Un numéro de téléphone dédié** (pas déjà utilisé sur l'app WhatsApp).
  - Idéalement un numéro fixe Monaco ou mobile dédié au Casino.
  - Doit pouvoir recevoir un SMS ou un appel de vérification.
  - **Ne plus jamais l'utiliser dans l'app WhatsApp grand public**.
- Un compte **Meta Business Manager** : <https://business.facebook.com>
- Un **WhatsApp Business Account (WABA)** rattaché.

## 2. Créer une App Meta Developer

1. <https://developers.facebook.com/apps/create/>
2. Type **Business** -> Nom : `CMCteams-WhatsApp`
3. Dans le tableau de bord -> **Ajouter un produit** -> **WhatsApp**
4. Section "Configuration de l'API" : Meta provisionne automatiquement :
   - Un **WhatsApp Business Account** de test
   - Un **numéro de test** (5 destinataires max, gratuit, illimité)
   - Un **token temporaire** valable 24h
   - Un **Phone Number ID** (= `WA_PHONE_NUMBER_ID`)
   - Un **Business Account ID** (`WABA_ID`)

## 3. Vérifier votre numéro de production

> Étape la plus longue : 1 à 5 jours ouvrés.

1. Onglet **WhatsApp -> Numéros de téléphone** -> **Ajouter un numéro**
2. Saisir le numéro Monaco/France dédié.
3. Choisir le mode de vérification (**SMS** ou **appel vocal**).
4. Saisir le code reçu.
5. Définir le **nom à afficher** (ex : "Casino Monte-Carlo").
   - Sera examiné manuellement par Meta (24-72h).
   - Doit correspondre au nom légal de l'entreprise.
6. Une fois approuvé, le numéro devient utilisable en production.

## 4. Obtenir un Token d'Accès PERMANENT

Le token affiché par défaut expire en 24h. Pour un token permanent :

### 4.1 Créer un Système d'Utilisateur

1. **Business Settings** : <https://business.facebook.com/settings>
2. Menu **Utilisateurs -> Utilisateurs système** -> **Ajouter**
3. Nom : `cmcteams-bot` -> Rôle : **Admin**

### 4.2 Attribuer les actifs

1. Sélectionner l'utilisateur système créé
2. **Actifs attribués -> Ajouter -> Apps** -> sélectionner `CMCteams-WhatsApp`
3. Permissions : **Manage app**
4. **Actifs attribués -> Ajouter -> WhatsApp Accounts** -> sélectionner le WABA
5. Permissions : **Manage WhatsApp business account**

### 4.3 Générer le token

1. Dans la page utilisateur système -> **Générer un nouveau token**
2. App : `CMCteams-WhatsApp`
3. Expiration : **Jamais**
4. Permissions à cocher :
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
5. Copier le token (commence par `EAA...`) — **ne sera plus jamais affiché**.

## 5. Configuration locale

Ajouter dans `~/.claude/secrets/cmcteams.env` :

```bash
export WA_ACCESS_TOKEN="EAA...permanent..."
export WA_PHONE_NUMBER_ID="123456789012345"
export WA_BUSINESS_ACCOUNT_ID="987654321098765"
# Optionnel pour les webhooks entrants
export WA_VERIFY_TOKEN="un-secret-aleatoire-pour-la-verification-webhook"
```

## 6. Tester l'envoi

```bash
curl -X POST \
  "https://graph.facebook.com/v20.0/$WA_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "33612345678",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'
```

> **Important** : à la 1ère interaction, vous DEVEZ utiliser un **template
> approuvé** (par défaut `hello_world` est pré-approuvé). Une fois que
> l'utilisateur a répondu, vous avez **24h** pour envoyer librement des
> messages texte (fenêtre de service client).

## 7. Templates de messages

Les messages "marketing" (à l'initiative du Casino, hors fenêtre 24h)
nécessitent un **template approuvé** par Meta :

1. **Meta Business Suite -> WhatsApp Manager -> Modèles de messages**
2. **Créer** -> catégorie : Utility / Marketing / Authentication
3. Langue : `fr` (français)
4. Variables : `{{1}}`, `{{2}}` etc.
5. Soumettre -> approbation Meta sous 1-24h.

Exemple : template `confirmation_planning_fr` avec variable `{{1}}` = mois.

## 8. Webhooks entrants (optionnel)

Pour recevoir les messages des clients en temps réel :

1. URL HTTPS publique (ex : Cloudflare Worker, Vercel, ngrok).
2. **Configuration -> Webhooks** dans l'app Meta Developer
3. URL de callback : `https://votre-domaine.tld/whatsapp/webhook`
4. Verify token : `WA_VERIFY_TOKEN`
5. S'abonner aux événements : `messages`

Voir `client.js -> receiveWebhook()` pour le parsing.

## 9. Tarification (Monaco / Europe — 2026)

| Catégorie | Prix indicatif / conversation 24h |
|-----------|-----------------------------------|
| Service (réponse à l'utilisateur) | **Gratuit** |
| Utility (notif transactionnelle) | ~0,03 € |
| Authentication (OTP) | ~0,03 € |
| Marketing | ~0,06 € |

**1000 premières conversations / mois GRATUITES toutes catégories.**

## 10. Sécurité

- Token = secret critique : régénération immédiate en cas de fuite.
- Webhook : TOUJOURS valider la signature HMAC SHA256 avec `app_secret`.
- Numéros de téléphone : format E.164 sans `+` ni espaces (ex : `33612345678`).

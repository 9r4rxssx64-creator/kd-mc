# kdmc-outlook

Module Outlook / Microsoft 365 pour CMCteams (Kevin DESARZENS / U11804).

Gestion d'événements du calendrier Outlook et envoi de mails via Microsoft Graph API.

## Installation

```bash
cd tools/integrations/outlook
npm install
```

Configuration : voir [`setup.md`](./setup.md) (Azure App Registration requis).

## Exemples

### Créer un événement

```js
import { createEvent } from "./client.js";

const ev = await createEvent(
  "Reunion chefs BJ",
  "2026-04-20T09:00:00",
  "2026-04-20T10:00:00",
  "<p>Point mensuel planning + conges ete</p>",
  ["chef1@monaco.mc", "chef2@monaco.mc"]
);
console.log("Outlook event :", ev.webLink);
```

### Lister les événements de la semaine

```js
import { listEvents } from "./client.js";

const events = await listEvents(7);
events.forEach(e => {
  console.log(e.start.dateTime, "-", e.subject);
});
```

### Envoyer un mail de rappel

```js
import { sendMail } from "./client.js";

await sendMail(
  ["employe1@monaco.mc", "employe2@monaco.mc"],
  "Rappel : planning mai 2026 disponible",
  `<p>Bonjour,</p>
   <p>Le planning de mai est en ligne sur CMCteams.</p>
   <p>Cordialement,<br>K. DESARZENS</p>`
);
```

### Exemple curl (Graph API direct)

```bash
# Obtenir un access_token (client credentials)
ACCESS_TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/$MS_TENANT_ID/oauth2/v2.0/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=$MS_CLIENT_ID" \
  -d "client_secret=$MS_CLIENT_SECRET" \
  -d "scope=https://graph.microsoft.com/.default" | jq -r .access_token)

# Envoyer un mail
curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "subject": "Test CMCteams",
      "body": {"contentType":"HTML","content":"<p>Hello</p>"},
      "toRecipients": [{"emailAddress":{"address":"test@monaco.mc"}}]
    },
    "saveToSentItems": true
  }' \
  "https://graph.microsoft.com/v1.0/users/$MS_USER_ID/sendMail"
```

## API

| Fonction | Signature | Retour |
|----------|-----------|--------|
| `createEvent` | `(summary, startTime, endTime, body?, attendees?)` | Event Graph |
| `listEvents` | `(days=7)` | `Array<Event>` |
| `sendMail` | `(to, subject, body)` | `{sent, to}` |

## Sécurité

- Auth : **ClientSecretCredential** (app-only) — adapté aux scripts automatisés
- Pour une app interactive (user delegated), remplacer par `DeviceCodeCredential` de `@azure/identity`
- `client_secret` : **rotation 2 ans** recommandée (Azure force expiration max 24 mois)
- Aucun secret dans le code — tout via `process.env.*`
- Audit Azure : chaque appel Graph est tracé (Portal -> Audit logs)

## Cas d'usage SBM

- Sync planning CMCteams -> Outlook des employés (1 event par shift)
- Notifications automatiques (rappels changements de planning)
- Envoi de newsletters équipe BJ / Roulettes / CMC
- Rappels de formations (écoles de jeux, Art. 5 Convention)

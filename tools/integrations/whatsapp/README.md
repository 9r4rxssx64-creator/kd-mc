# WhatsApp Business — CMCteams

Module d'intégration WhatsApp Business Cloud API pour notifications planning,
demandes d'échange, alertes RH, communication directe avec les 258 employés
du Casino de Monte-Carlo.

## Coût

**Gratuit jusqu'à 1 000 conversations / mois.** Au-delà ~0,03 € à 0,06 € /
conversation 24h. Pour 258 employés contactés 1×/semaine = ~1100 conv/mois,
soit ~3 € à 6 € /mois en moyenne.

## Installation

```bash
cd tools/integrations/whatsapp
npm install
```

## Configuration

Voir [`setup.md`](./setup.md) pour la procédure complète (compte Meta Business,
vérification du numéro, génération du token permanent, templates).

```bash
export WA_ACCESS_TOKEN="EAA...permanent..."
export WA_PHONE_NUMBER_ID="123456789012345"
export WA_VERIFY_TOKEN="secret-aleatoire"   # pour webhooks
```

## Exemples

### Message texte (fenêtre 24h après réponse de l'utilisateur)

```js
import wa from "./client.js";

await wa.sendMessage("33612345678", "Bonjour, votre planning du mois de mai est disponible.");
```

### Template (initiative du Casino, hors fenêtre 24h)

```js
// Template "rappel_planning_fr" approuvé par Meta avec 2 variables
await wa.sendTemplate(
  "33612345678",
  "rappel_planning_fr",
  ["DUPONT J", "Mai 2026"],
  "fr"
);
```

### Média (image, document PDF, vidéo)

```js
// Image avec légende
await wa.sendMedia(
  "33612345678",
  "https://cmcteams.fr/img/planning-mai.jpg",
  "image",
  { caption: "Votre planning de mai" }
);

// PDF
await wa.sendMedia(
  "33612345678",
  "https://cmcteams.fr/pdf/planning-DUPONT-mai.pdf",
  "document",
  { filename: "planning-mai-2026.pdf" }
);
```

### Webhook entrant (Express)

```js
import express from "express";
import wa from "./client.js";

const app = express();
app.use(express.json());

// Handshake initial GET
app.get("/whatsapp/webhook", (req, res) => {
  const challenge = wa.verifyWebhookHandshake(req.query);
  if (challenge) res.status(200).send(challenge);
  else res.sendStatus(403);
});

// Messages entrants POST
app.post("/whatsapp/webhook", (req, res) => {
  res.sendStatus(200); // ACK immédiat (sous 5s)
  const { messages, statuses } = wa.receiveWebhook(req.body);
  for (const m of messages) {
    console.log(`[${m.from}] ${m.type === "text" ? m.text : `[${m.type}]`}`);
    // Logique de réponse automatique ou alerte admin
  }
  for (const s of statuses) {
    console.log(`status ${s.status} pour ${s.id}`);
  }
});

app.listen(3000);
```

## Cas d'usage CMCteams

| Besoin | Méthode |
|--------|---------|
| Notifier publication planning mois | `sendTemplate` à tous les employés |
| Confirmer demande d'échange acceptée | `sendMessage` (fenêtre 24h) |
| Envoyer le PDF planning personnel | `sendMedia` type document |
| Alertes RH urgentes (changement shift) | `sendTemplate` catégorie Utility |
| Réception réponses employés | webhook `receiveWebhook` -> intégration vChat |

## Sécurité

- Token permanent = secret critique, jamais commit.
- Webhook : valider `X-Hub-Signature-256` HMAC SHA256 avec `app_secret`.
- Numéros employés stockés dans A.reg.usbm OU champ dédié à créer.
- Toutes les actions doivent passer le guard admin `A.user.id === AID` côté CMCteams.
- Audit obligatoire : `_audit("wa_send", {to, type})` à chaque envoi.

# Facebook Pages — CMCteams

Module d'intégration Facebook Pages API pour la communication officielle du
Casino de Monte-Carlo (annonces publiques, messagerie, statistiques d'engagement).

## Installation

```bash
cd tools/integrations/facebook
npm install
```

## Configuration

Voir [`setup.md`](./setup.md) pour obtenir le `FB_PAGE_TOKEN`.

```bash
export FB_PAGE_ID="123456789012345"
export FB_PAGE_TOKEN="EAAB...permanent..."
```

## Exemples

### Publier un post

```js
import fb from "./client.js";

// Texte simple
await fb.createPost("Le Casino recrute pour la saison été. Postulez avant le 30 mai.");

// Avec image
await fb.createPost(
  "Soirée Black Jack ce vendredi !",
  "https://www.casinomontecarlo.com/img/event-bj.jpg"
);
```

### Statistiques

```js
const stats = await fb.getPageInsights(
  ["page_impressions", "page_engaged_users", "page_fans"],
  { period: "week" }
);
console.log(stats.data);
```

### Messages non-lus

```js
const unread = await fb.listUnreadMessages(50);
for (const conv of unread) {
  console.log(conv.id, conv.snippet, "non-lus:", conv.unread_count);
}
```

### Répondre

```js
await fb.replyToMessage(unread[0].id, "Merci de votre message, nous revenons vers vous sous 24h.");
```

## Sécurité

- Token JAMAIS commit (cf. règle globale `~/.claude/CLAUDE.md`).
- Toutes les fonctions destructrices côté admin doivent être loggées via
  `_audit("fb_post", ...)` quand intégrées dans CMCteams.

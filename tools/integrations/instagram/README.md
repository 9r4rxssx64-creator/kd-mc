# Instagram Business — CMCteams

Module d'intégration Instagram Graph API pour la communication visuelle du
Casino de Monte-Carlo (annonces visuelles, stories événementielles,
modération des commentaires).

## Installation

```bash
cd tools/integrations/instagram
npm install
```

## Configuration

Voir [`setup.md`](./setup.md) — exige un compte Instagram **Business** lié à
une Page Facebook administrée par Kevin.

```bash
export IG_USER_ID="17841401234567890"
export IG_ACCESS_TOKEN="$FB_PAGE_TOKEN"   # même token que Facebook
```

## Exemples

### Publier une photo

```js
import ig from "./client.js";

await ig.createPost(
  "https://www.casinomontecarlo.com/img/blackjack-soiree.jpg",
  "Soirée Black Jack ce vendredi 22h. Tenue correcte exigée. #CasinoMonteCarlo #BlackJack"
);
```

### Story 24h

```js
await ig.createStory("https://www.casinomontecarlo.com/img/story-event.jpg");
```

### Insights d'un post

```js
const stats = await ig.getMediaInsights("17912345678901234");
console.log(stats.data);
```

### Modérer les commentaires

```js
const comments = await ig.listComments("17912345678901234", 100);
for (const c of comments) {
  console.log(`@${c.username}: ${c.text}`);
}

// Répondre
await ig.replyComment(comments[0].id, "Merci ! Réservation au +377 98 06 21 21");
```

## Limites Meta

- 25 posts / jour max
- 50 stories / jour max
- Image JPEG <8MB, ratio entre 4:5 et 1.91:1
- Caption max 2200 caractères, max 30 hashtags

## Sécurité

- Token partagé avec Facebook : ne JAMAIS commit.
- Les actions de modération (suppression de commentaires) doivent être loggées
  via `_audit("ig_*", ...)` quand intégrées dans CMCteams.

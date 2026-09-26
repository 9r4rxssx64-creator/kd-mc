# kdmc-gcalendar

Module Google Calendar pour CMCteams (Kevin DESARZENS / U11804).

Création, lecture, mise à jour, suppression d'événements via l'API Google Calendar v3.

## Installation

```bash
cd tools/integrations/gcalendar
npm install
```

Configuration : voir [`setup.md`](./setup.md).

## Exemples

### Créer une réunion casino

```js
import { createEvent } from "./client.js";

const ev = await createEvent({
  summary: "Reunion chefs de table BJ",
  start: "2026-04-20T09:00:00+02:00",
  end:   "2026-04-20T10:00:00+02:00",
  description: "Point planning mensuel + conges ete",
  attendees: ["chef1@monaco.mc", "chef2@monaco.mc"],
});
console.log("Evenement cree :", ev.htmlLink);
```

### Lister les événements du jour

```js
import { getEventsToday } from "./client.js";

const events = await getEventsToday();
events.forEach(e => {
  console.log(e.start.dateTime, "-", e.summary);
});
```

### Lister la semaine (utile pour dashboard CMCteams)

```js
import { getEventsThisWeek } from "./client.js";

const week = await getEventsThisWeek();
console.log(`${week.length} evenements sur 7 jours`);
```

### Modifier / supprimer

```js
import { updateEvent, deleteEvent } from "./client.js";

await updateEvent("eventId123", {
  summary: "Reunion chefs (deplacee)",
  start: "2026-04-20T14:00:00+02:00",
  end:   "2026-04-20T15:00:00+02:00",
});

await deleteEvent("eventId123");
```

### Exemple curl (API directe)

```bash
curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Shift BJ Atrium",
    "start": {"dateTime":"2026-04-20T14:00:00+02:00","timeZone":"Europe/Monaco"},
    "end":   {"dateTime":"2026-04-20T22:00:00+02:00","timeZone":"Europe/Monaco"}
  }' \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events"
```

## API

| Fonction | Signature | Retour |
|----------|-----------|--------|
| `createEvent` | `({summary, start, end, description?, attendees?})` | Event |
| `listEvents` | `(timeMin, timeMax?)` | `Array<Event>` |
| `updateEvent` | `(eventId, {summary?, start?, end?, ...})` | Event |
| `deleteEvent` | `(eventId)` | `{deleted, eventId}` |
| `getEventsToday` | `()` | `Array<Event>` |
| `getEventsThisWeek` | `()` | `Array<Event>` |

## Sécurité

- Scope minimal `calendar.events` (pas d'accès aux settings du calendrier)
- Timezone par défaut : `Europe/Monaco` (surchargeable via `GCAL_TIMEZONE`)
- `sendUpdates: "all"` quand attendees présents -> envoi des invitations mail
- Aucun secret hardcodé, tout via `process.env.*`

## Cas d'usage SBM

- Sync automatique du planning CMCteams -> Calendar (1 event par shift)
- Rappels de réunions chefs de table / pitboss
- Calendrier partagé événements SBM (Grand Prix, forte affluence, formations)

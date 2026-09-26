# GOOGLE_APIS_INTEGRATION.md — APIs Google complètes pour Apex AI

> **Créé** : 2026-04-21 par Claude Code
> **Usage** : Intégrer Gmail, Calendar, Drive, Sheets, Docs, Tasks, Maps dans Apex + CMCteams

---

## 🔐 OAuth 2.0 + Google Identity Services (GIS) — 2026

### Setup (1 fois par projet)

1. https://console.cloud.google.com → créer projet "Apex AI"
2. APIs & Services → OAuth consent screen → type "External" → fill app name + support email
3. Credentials → Create OAuth Client ID → Web application
4. Authorized JS origins : `https://9r4rxssx64-creator.github.io`
5. Authorized redirect URIs : `https://9r4rxssx64-creator.github.io/cmcteams/apex-ai/`
6. Copier `CLIENT_ID` → coller dans Apex Settings > Google

### Code flow moderne (GIS Token Model)

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
const CLIENT_ID = "xxx.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive";

let tokenClient;
function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.access_token) {
        localStorage.setItem("ax_google_token", response.access_token);
        localStorage.setItem("ax_google_token_exp", Date.now() + 3600*1000);
      }
    }
  });
}

function axGoogleSignIn() {
  if (!tokenClient) initTokenClient();
  tokenClient.requestAccessToken();
}
</script>
```

Token valide 1h. Refresh via `prompt:""` (silent) si user déjà autorisé.

---

## 📧 Gmail API

### Scopes
- `gmail.send` : envoyer uniquement (minimum intrusif)
- `gmail.readonly` : lire inbox
- `gmail.modify` : marquer lu, label, archiver
- `gmail.compose` : drafts

### Envoyer un email

```javascript
async function gmailSend(to, subject, body) {
  const token = localStorage.getItem("ax_google_token");
  const msg = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${body}`;
  const raw = btoa(unescape(encodeURIComponent(msg))).replace(/\+/g,'-').replace(/\//g,'_');
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {"Authorization": "Bearer "+token, "Content-Type": "application/json"},
    body: JSON.stringify({raw})
  });
  return r.json();
}
```

### Lire inbox

```javascript
async function gmailList(query = "is:unread", max = 10) {
  const token = localStorage.getItem("ax_google_token");
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`, {
    headers: {"Authorization": "Bearer "+token}
  });
  const {messages} = await r.json();
  const details = await Promise.all(messages.map(m =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`, {
      headers: {"Authorization": "Bearer "+token}
    }).then(r => r.json())
  ));
  return details;
}
```

**Quota** : 1 milliard units/jour gratuit. Un send = 100 units. Kevin peut envoyer 10M emails/jour (OK).

---

## 📅 Google Calendar API

### Scopes : `calendar` (full) ou `calendar.readonly`

### Créer événement

```javascript
async function calendarCreate(summary, start, end, description = "") {
  const token = localStorage.getItem("ax_google_token");
  const event = {
    summary, description,
    start: {dateTime: start, timeZone: "Europe/Monaco"},
    end: {dateTime: end, timeZone: "Europe/Monaco"},
    reminders: {useDefault: true}
  };
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {"Authorization": "Bearer "+token, "Content-Type": "application/json"},
    body: JSON.stringify(event)
  });
  return r.json();
}
```

### Lister événements du jour

```javascript
async function calendarToday() {
  const token = localStorage.getItem("ax_google_token");
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${today.toISOString()}&timeMax=${tomorrow.toISOString()}&orderBy=startTime&singleEvents=true`;
  const r = await fetch(url, {headers: {"Authorization": "Bearer "+token}});
  return (await r.json()).items;
}
```

---

## 📁 Google Drive API

### Scopes : `drive.file` (minimum) ou `drive`

### Upload fichier

```javascript
async function driveUpload(filename, content, mimeType = "text/plain") {
  const token = localStorage.getItem("ax_google_token");
  const meta = {name: filename, mimeType};
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(meta)], {type: "application/json"}));
  form.append("file", new Blob([content], {type: mimeType}));
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {"Authorization": "Bearer "+token},
    body: form
  });
  return r.json();
}
```

### Backup Apex sur Drive (use case Kevin)

Bouton "📤 Backup sur Google Drive" → zipper toutes les data Apex → upload → lien partageable.

---

## 📊 Google Sheets API

### Lire cellules

```javascript
async function sheetsRead(sheetId, range) {
  const token = localStorage.getItem("ax_google_token");
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
    headers: {"Authorization": "Bearer "+token}
  });
  return (await r.json()).values;
}
```

### Écrire / append

```javascript
async function sheetsAppend(sheetId, range, values) {
  const token = localStorage.getItem("ax_google_token");
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: {"Authorization": "Bearer "+token, "Content-Type": "application/json"},
    body: JSON.stringify({values})
  });
  return r.json();
}
```

**Use case CMCteams** : export planning mensuel → Google Sheet partagé avec équipe, accessible offline.

---

## 📝 Google Docs API

```javascript
async function docsCreate(title) {
  const token = localStorage.getItem("ax_google_token");
  const r = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {"Authorization": "Bearer "+token, "Content-Type": "application/json"},
    body: JSON.stringify({title})
  });
  return r.json();
}

async function docsAppend(docId, text) {
  const token = localStorage.getItem("ax_google_token");
  return fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {"Authorization": "Bearer "+token, "Content-Type": "application/json"},
    body: JSON.stringify({
      requests: [{insertText: {location: {index: 1}, text}}]
    })
  });
}
```

---

## ✅ Google Tasks API

```javascript
async function tasksAdd(title, notes = "", due = null) {
  const token = localStorage.getItem("ax_google_token");
  const task = {title, notes};
  if (due) task.due = new Date(due).toISOString();
  const r = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    headers: {"Authorization": "Bearer "+token, "Content-Type": "application/json"},
    body: JSON.stringify(task)
  });
  return r.json();
}
```

---

## 🗺 Google Maps JavaScript API

Charger : `<script src="https://maps.googleapis.com/maps/api/js?key=API_KEY&libraries=places"></script>`

### Directions entre 2 points

```javascript
async function getDirections(origin, destination) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${API_KEY}`;
  return (await fetch(url)).json();
}
```

### Places Autocomplete

```javascript
const autocomplete = new google.maps.places.Autocomplete(inputEl);
autocomplete.addListener("place_changed", () => {
  const place = autocomplete.getPlace();
  console.log(place.formatted_address, place.geometry.location);
});
```

**Use case Apex** : géolocalisation contexte (domicile, casino, voyage) → adapte réponses IA.

---

## 👁 Google Cloud Vision API (OCR, labels, face)

```javascript
async function visionAnalyze(imageBase64, features = ["TEXT_DETECTION", "LABEL_DETECTION"]) {
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      requests: [{
        image: {content: imageBase64},
        features: features.map(type => ({type, maxResults: 10}))
      }]
    })
  });
  return (await r.json()).responses[0];
}
```

**Use case Apex** : remplace GPT-4V pour OCR massif (moins cher). `axIdentifyAndShop` peut utiliser ça.

---

## 🎙 Google Cloud Speech-to-Text / Text-to-Speech

**Pour Kevin** : navigateur natif suffit (gratuit). Google Cloud STT/TTS = payant mais qualité supérieure.
- STT : $0.006/15s
- TTS Neural2 : $16/1M chars

À considérer seulement si Kevin veut voix premium (WaveNet).

---

## 🔄 Sync CMCteams planning → Google Calendar

**Use case métier** : chaque employé a ses shifts CMCteams dans son Google Calendar perso.

Pattern :
1. Kevin (admin) connecte son Google OAuth dans CMCteams
2. `adminSyncPlanningToGCal()` : boucle sur employés, pour chaque shift → calendarCreate
3. Stocke `eventId` dans overrides → si modifié, update; si supprimé, delete
4. Employé ajoute invitation à son propre calendar (email invite)

Code partiel :
```javascript
async function cmcSyncToGCal(year, month) {
  const ov = gpl(year, month); // planning du mois
  for (const empId in ov) {
    const emp = A.employees.find(e => e.id === empId);
    if (!emp || !A.reg[empId]?.email) continue;
    for (let day in ov[empId]) {
      const code = ov[empId][day];
      if (!CODE_HOURS[code]) continue;
      const {start, end} = CODE_HOURS[code];
      const eventDate = new Date(year, month, day);
      await calendarCreate(
        `Shift ${emp.family} (${code})`,
        `${eventDate.toISOString().slice(0,10)}T${start}:00`,
        `${eventDate.toISOString().slice(0,10)}T${end}:00`,
        `Équipe: ${emp.team}\nShift CMCteams auto-sync`
      );
    }
  }
}
```

---

## 🎯 Top 15 Google integrations Apex should add

1. **Google OAuth login** (bouton "Se connecter avec Google")
2. **Gmail send** (IA peut envoyer mail automatique)
3. **Gmail read inbox** (briefing matinal avec résumé mails)
4. **Calendar create event** depuis chat ("Mets-moi un RV demain 14h")
5. **Calendar today briefing** ("Qu'est-ce que j'ai aujourd'hui ?")
6. **Drive upload** (backup auto + partage docs)
7. **Sheets read/write** (cmcteams export planning)
8. **Tasks add/list** (todo sync Google Tasks natif)
9. **Maps directions** (trajet vers casino matin)
10. **Vision OCR** (lire facture papier, carte de visite)
11. **Contacts search** (trouver téléphone rapidement)
12. **YouTube history** (recommandations basées historique)
13. **Photos search** ("Trouve photo Ibiza juillet 2025")
14. **Drive backup auto** (chaque nuit backup Apex data)
15. **CMCteams → GCal sync** (planning employés dans leurs calendars)

---

## 🏢 Limites Workspace (si Kevin a Workspace SBM)

Certains APIs peuvent être bloquées par admin SBM :
- Third-party app access (nécessite admin approval)
- Scopes sensibles (gmail.full, drive.full)
- Workaround : demander à IT SBM de whitelister Apex dans Google Workspace admin

---

**Dernière MAJ** : 2026-04-21 par Claude Code (v12.33 roadmap)

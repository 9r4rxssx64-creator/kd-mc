# APPLE_IOS_SKILLS.md — Compétences Apple/iOS/Google pour Apex + CMCteams

> **Créé** : 2026-04-21 par Claude Code (Kevin 2026-04-21)
> **Objectif** : Doter Apex et CMCteams des meilleures intégrations possible avec iPhone, iOS, Safari, Apple et écosystème Google depuis une PWA web.

---

## 🎯 Contexte Kevin

Kevin utilise majoritairement :
- **iPhone** (principal — iOS Safari PWA)
- **Tablette Android** (secondaire — Chrome PWA)
- **Ordinateur** (Safari / Chrome)
- Comptes : Gmail, iCloud, Outlook (monaco.mc)

---

## 📱 Capacités PWA iOS Safari (natif, sans app store)

### ✅ Ce qui MARCHE depuis PWA iOS (vérifié 2026)

| Capability | API | Usage dans Apex |
|-----------|-----|-----------------|
| **Home screen install** | `beforeinstallprompt` + meta | PWA s'installe comme app native |
| **Service Worker** | `navigator.serviceWorker` | Cache offline + push notif basique |
| **Notifications** | `Notification.requestPermission()` | Toast natif (PWA only, iOS 16.4+) |
| **Geolocation GPS** | `navigator.geolocation` | Position précise, altitude, vitesse |
| **Camera** | `getUserMedia({video:true})` | Photo + vidéo depuis Safari |
| **Microphone** | `getUserMedia({audio:true})` + `SpeechRecognition` | Dictée vocale STT |
| **Speakers TTS** | `speechSynthesis` | Lecture vocale sortie |
| **Biometrics** | `navigator.credentials` + WebAuthn | Face ID / Touch ID (PassKey) |
| **Clipboard** | `navigator.clipboard.read/write` | Lire/écrire presse-papier |
| **Files API** | `<input type="file">` + drag drop | Upload photos/docs |
| **Share API** | `navigator.share()` | Partage natif iOS (Messages, AirDrop) |
| **Vibration** | `navigator.vibrate()` | ❌ Pas sur iOS (Android only) |
| **Fullscreen** | `document.documentElement.requestFullscreen()` | Immersif |
| **Screen Wake Lock** | `navigator.wakeLock.request("screen")` | Écran reste allumé |
| **Payment Request** | `PaymentRequest` API | Apple Pay web natif |
| **Web Bluetooth** | `navigator.bluetooth` | ❌ Pas sur Safari (Chrome seulement) |
| **WebUSB** | `navigator.usb` | ❌ Pas sur Safari |
| **WebSerial** | `navigator.serial` | ❌ Pas sur Safari |
| **Orientation** | `DeviceOrientationEvent` | Gyroscope/accéléromètre (demande permission iOS 13+) |
| **Haptic Feedback** | `navigator.vibrate` + `Taptic via AudioContext` | Feedback tactile via son ultra-grave |
| **Dark Mode detection** | `matchMedia("(prefers-color-scheme:dark)")` | Auto theme |
| **Reduced Motion** | `matchMedia("(prefers-reduced-motion)")` | Accessibilité |
| **Save offline data** | `IndexedDB` + `Cache API` | Base locale massive |
| **Background Sync** | `sync` event | ❌ Safari limité, works on Android Chrome |

### ❌ Limites Safari iOS PWA (contournements possibles)

| Limitation | Contournement |
|------------|---------------|
| Pas de push notif server-to-client sans autorisation utilisateur | Demander + utiliser Service Worker push |
| Cache PWA agressif | Version service worker à chaque déploy (`kdmc-v12.X`) + notifyUpdateAvailable |
| Pas d'accès WebBluetooth | Passer par Home Assistant REST API |
| Pas de NFC Web | Utiliser deep link `nfc://` ou QR code |
| Pas de background fetch illimité | Utiliser Firebase Cloud Messaging (FCM) + Worker Cloudflare |
| Permissions doivent être redemandées après force-refresh | Stocker consentement CGU + retriggerer au login |

---

## 🍎 Intégrations Apple natives (URL schemes + deep links)

### iOS URL Schemes utilisables depuis un `<a href="...">` dans Apex

| Action | URL | Exemple |
|--------|-----|---------|
| **Appeler** | `tel:+377...` | `<a href="tel:+37799123456">Appeler</a>` |
| **SMS** | `sms:+377...?body=...` | `<a href="sms:+37799123456?body=Hi">SMS</a>` |
| **Email** | `mailto:email?subject=&body=` | `<a href="mailto:k@monaco.mc">Email</a>` |
| **FaceTime** | `facetime:numero` | `<a href="facetime:+377...">FaceTime</a>` |
| **FaceTime Audio** | `facetime-audio:numero` | Audio-only |
| **iMessage** | `imessage:numero` | Force iMessage |
| **Maps** | `maps://?q=Monaco+Casino` | Ouvre Apple Maps |
| **Maps direction** | `maps://?saddr=&daddr=` | Itinéraire |
| **Calendar** | `calshow:` ou `x-apple-calevent://` | Ouvre Calendrier |
| **Contacts** | Pas d'URL scheme direct | Utiliser `addressbook://` |
| **Notes** | `mobilenotes://` | Ouvre Notes |
| **Settings** | `App-Prefs:` (iOS < 13) ou `prefs:` | Réglages iOS |
| **Music** | `music://` | Apple Music |
| **Podcasts** | `pcast://` | Apple Podcasts |
| **Wallet** | `shoebox://` | Apple Wallet |
| **Photos** | `photos-redirect://` | Photos |
| **App Store** | `itms-apps://apps.apple.com/app/id...` | AppStore direct |
| **Siri Shortcuts** | `shortcuts://run-shortcut?name=...` | Lance raccourci |

### ⚡ Siri Shortcuts integration (puissant!)

Apex peut créer des **Siri Shortcuts** via URL schemes → raccourci vocal natif iOS.

**Exemple** :
```javascript
// Dans Apex, créer un shortcut pour "Briefing KDMC"
const shortcutUrl = "shortcuts://create-shortcut?name=Briefing+KDMC&action=openURL&url=" +
  encodeURIComponent("https://apex-ai.fr/#action=daily_briefing");
window.location.href = shortcutUrl;
```

Ensuite Kevin dit "Dis Siri, briefing KDMC" → Siri ouvre l'URL → Apex déclenche `daily_briefing`.

### 🔒 Apple Sign In + PassKeys

Depuis Safari iOS/macOS, **WebAuthn + PassKeys** fonctionnent natif :
- Face ID / Touch ID pour login
- Sync automatique iCloud Keychain entre iPhone/iPad/Mac
- Pas besoin d'app, marche depuis web
- Déjà implémenté partiellement dans Apex (`axBiometricRegister/Auth`)

---

## 🤖 Intégrations Google (CMCteams + Apex)

### OAuth Google (pour accéder services Google)

| Service | Scope OAuth | Usage |
|---------|-------------|-------|
| **Gmail** | `https://www.googleapis.com/auth/gmail.send` | Envoyer emails via API |
| **Gmail read** | `https://www.googleapis.com/auth/gmail.readonly` | Lire inbox |
| **Calendar** | `https://www.googleapis.com/auth/calendar` | Créer/lire événements |
| **Drive** | `https://www.googleapis.com/auth/drive` | Stocker/lire fichiers |
| **Sheets** | `https://www.googleapis.com/auth/spreadsheets` | Lire/écrire tableaux |
| **Docs** | `https://www.googleapis.com/auth/documents` | Lire/écrire docs |
| **Tasks** | `https://www.googleapis.com/auth/tasks` | Gérer to-dos |
| **Maps** | API Key (pas OAuth) | Géocoding, directions |
| **YouTube** | `https://www.googleapis.com/auth/youtube` | Lire chaîne/upload |
| **Contacts** | `https://www.googleapis.com/auth/contacts` | Gérer contacts |

### Setup Google OAuth pour Apex

1. https://console.cloud.google.com/apis/credentials → Create OAuth Client ID (Web)
2. Authorized JS origins : `https://9r4rxssx64-creator.github.io`
3. Redirect URI : `https://9r4rxssx64-creator.github.io/cmcteams/apex-ai/#oauth-callback`
4. Copier `CLIENT_ID` et `CLIENT_SECRET`
5. Dans Apex → Réglages → Google OAuth → coller CLIENT_ID
6. Flow : `gapi.auth2.init({client_id, scope}).signIn()` → token → fetch APIs

### Google Identity Services (GIS) — nouvelle méthode 2026

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
google.accounts.id.initialize({
  client_id: "xxx.apps.googleusercontent.com",
  callback: (response) => { /* jwt token */ }
});
google.accounts.id.prompt();
</script>
```

Ajoute dans Apex : bouton "Se connecter avec Google" → token → autorise tous les scopes en une passe.

---

## 📲 Contrôle iPhone depuis PWA Apex (contournements)

### Méthodes disponibles (pas root/jailbreak)

1. **Shortcuts app + URL schemes** : tu écris des Siri Shortcuts qui font des actions iOS. Apex lance un URL scheme qui déclenche le raccourci.
2. **Home Assistant iOS companion app** : installe HA companion sur iPhone → expose la plupart des actions iOS via REST API → Apex commande via HA.
3. **Apple Shortcuts + HTTP GET** : un raccourci iOS peut écouter un webhook → Apex envoie GET à l'URL → raccourci déclenche action iOS.
4. **Pushcut** ($3/mois) : déclenche scripts iOS depuis HTTP webhook. Plus simple que Shortcuts.
5. **IFTTT / Zapier webhook** : intermédiaire.

### Actions iOS possibles via Shortcuts

- Lire message / envoyer iMessage
- Créer événement calendar / reminder
- Lancer app spécifique
- Ajuster luminosité / volume
- Activer Low Power Mode
- Déclencher mode Focus
- Prendre photo (caméra frontale/arrière)
- Enregistrer audio
- Lire note vocale
- Contrôler HomeKit (lumières, thermostat)
- Envoyer notification custom
- Partager position actuelle

### Pattern Apex → iPhone via Shortcuts

```javascript
// Apex envoie webhook à Pushcut ou Shortcuts
async function axSendToIphone(action, params) {
  const webhookUrl = lg("ax_iphone_webhook", "");
  if (!webhookUrl) return "Webhook iPhone non configuré";
  return fetch(webhookUrl, {
    method: "POST",
    body: JSON.stringify({action, params, from: "apex-ai"})
  });
}

// Depuis chat: "Baisse la luminosité de mon iPhone à 20%"
// → Apex appelle axSendToIphone("brightness", {level: 20})
// → Pushcut reçoit → déclenche shortcut "Brightness" → iOS applique
```

---

## 🧰 Skills à ajouter dans Apex + CMCteams

### Apex AI — nouveaux outils IA (v12.35+)

- [ ] `apple_shortcut_run` : lance un raccourci iOS par nom
- [ ] `apple_maps_search` : ouvre Maps avec recherche
- [ ] `apple_call` : lance appel (tel:)
- [ ] `apple_sms` : envoie SMS (sms:)
- [ ] `apple_facetime` : lance FaceTime
- [ ] `apple_calendar_add` : ajoute événement iCloud via caldav
- [ ] `apple_note_add` : ajoute note via shortcut
- [ ] `apple_wallet_pass` : génère `.pkpass` (boarding pass, billet event)
- [ ] `google_gmail_send` : envoie email via Gmail API
- [ ] `google_calendar_add` : crée event Google Calendar
- [ ] `google_drive_upload` : upload fichier Google Drive
- [ ] `google_sheets_read` : lit cellule Google Sheet
- [ ] `google_tasks_add` : ajoute todo Google Tasks
- [ ] `google_maps_directions` : itinéraire entre 2 points
- [ ] `iphone_brightness` : via webhook Pushcut/Shortcuts
- [ ] `iphone_volume` : via webhook
- [ ] `iphone_focus_mode` : active Focus
- [ ] `iphone_photo` : demande prise de photo frontale/arrière
- [ ] `iphone_location` : renvoie position GPS précise
- [ ] `iphone_battery` : niveau batterie (via web API + shortcut)
- [ ] `homekit_toggle` : via Home Assistant iOS companion

### CMCteams — intégrations Google (v9.455+)

- [ ] Sync planning CMCteams → Google Calendar (chaque employé)
- [ ] Export feuille de route → Google Sheets
- [ ] Import contacts → Google Contacts
- [ ] Gmail auto-notif sur changement shift

---

## 🔐 Permissions iOS à documenter pour clients

À la première connexion, Apex doit demander (via CGU one-shot) :
- 📍 Localisation (pour domotique + contexte météo)
- 🎤 Microphone (dictée vocale)
- 📷 Caméra (identify & shop)
- 🔔 Notifications (alertes)
- 💾 Stockage local (données offline)
- 👁 Face ID (auth sans PIN)

Toutes via `cmcCguAsk` / `_cguAsk` (déjà implémenté v9.448 / v12.9).

Révocables individuellement via Réglages > Confidentialité iOS ou via settings Apex.

---

## 🚀 Roadmap implémentation

### Phase 1 (v12.32) — FAIT ou immédiat
- [x] Device trust + auto-login 30j sur appareil de confiance
- [x] Non-admin settings enrichis
- [x] Kevin admin detection case-insensitive

### Phase 2 (v12.33-34) — Recherche/Ajout
- [ ] Siri Shortcuts generator : bouton "Créer raccourci Siri" pour chaque action Apex
- [ ] Apple Pay web integration
- [ ] Google OAuth login bouton
- [ ] Gmail send/read via API

### Phase 3 (v12.35+) — Advanced
- [ ] Pushcut webhook integration
- [ ] HomeKit via Home Assistant bridge
- [ ] Google Drive/Sheets auto-sync
- [ ] Apple Calendar CalDAV integration

---

## 📚 Références officielles

- Safari Web Features : https://developer.apple.com/documentation/safari-release-notes
- WebKit Roadmap : https://webkit.org/status/
- iOS URL Schemes : https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference
- Siri Shortcuts : https://support.apple.com/guide/shortcuts/welcome/ios
- Google Identity Services : https://developers.google.com/identity/gsi/web
- Pushcut API : https://www.pushcut.io/webhook-api
- Home Assistant iOS : https://companion.home-assistant.io/

---

**Dernière MAJ** : 2026-04-21 par Claude Code (v12.32 Apex AI)

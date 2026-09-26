# ANDROID_SKILLS.md — Intégrations Android/Lenovo pour Apex AI

> **Créé** : 2026-04-21 par Claude Code (Kevin demande recherche large Android/Lenovo)
> **Usage** : Tablette Lenovo Kevin (secondaire) + généralisable à tout Android

---

## 📱 Capacités PWA Android 14+ (Chrome 120+)

Android est **beaucoup plus permissif** que iOS Safari pour les PWA.

### ✅ API Web supportées nativement Chrome Android

| API | Statut 2026 | Usage Apex |
|-----|-------------|------------|
| **Web Bluetooth** (scan, GATT connect) | ✅ Stable | Connect écouteurs, cardio, balance, IR blaster DIY |
| **Web USB** | ✅ Stable | Arduino, lecteurs RFID, clés hardware |
| **Web NFC** | ✅ Android only | Lire/écrire tags NTAG → URL triggers |
| **Web Serial** | ✅ Stable | Connect ESP32, microcontrôleurs |
| **Web MIDI** | ✅ Stable | Connect synthés, contrôleurs MIDI |
| **Web Share Target** | ✅ Stable | Apex apparaît dans menu "Partager" Android |
| **Badging API** | ✅ Stable | Badge nombre non-lus sur icône PWA |
| **Periodic Background Sync** | ✅ Stable | Tâche qui tourne toutes 12h en arrière-plan |
| **Background Fetch** | ✅ Stable | Upload/download gros fichiers en arrière-plan |
| **Contact Picker API** | ✅ Stable | Sélection contacts depuis carnet natif |
| **Web OTP** | ✅ Stable | Auto-fill SMS avec code à 6 chiffres |
| **Payment Request** | ✅ Stable | Google Pay web checkout |
| **Screen Wake Lock** | ✅ Stable | Écran reste allumé (pour cuisine, lecture) |
| **File System Access** | ✅ Stable | Lire/écrire fichiers locaux (beyond Downloads) |
| **Idle Detection** | ✅ Stable | Détecte inactivité user (>60s) |
| **Window Controls Overlay** | ✅ Stable | PWA ressemble app native desktop |
| **Shape Detection** (QR/barcode/face/text) | ✅ Stable | OCR natif, pas besoin lib lourde |
| **Vibration** | ✅ Stable | Feedback tactile (pattern `[200,100,200]`) |
| **Ambient Light Sensor** | ⚠️ Origin trial | Luminosité ambiante → adapte thème |
| **Gyroscope / Accelerometer** | ✅ Stable | Détection mouvement tablette |
| **Barometer** | ✅ Some devices | Pression atmosphérique |

### 🚀 Avantages Android vs iOS

- Web Bluetooth fonctionne (Apex peut scan + control appareils BLE)
- Web NFC fonctionne (tap tag → action)
- TWA (Trusted Web Activity) pour Play Store
- Chrome extensions possibles (dashboard desktop)

---

## 🔗 Intent URLs Android (triggers depuis Apex)

Android permet des URL schemes très puissants via `intent://`.

| Action | URL | Exemple |
|--------|-----|---------|
| **Appeler** | `tel:+377...` | `<a href="tel:+37799123456">` |
| **SMS** | `sms:+377...?body=Texte` | Envoie SMS |
| **Email** | `mailto:...` | Ouvre client email |
| **WhatsApp** | `whatsapp://send?phone=+377xxx&text=Salut` | Chat direct WA |
| **Maps Google** | `geo:43.7384,7.4246?q=Casino+Monaco` | Ouvre Google Maps |
| **Navigation** | `google.navigation:q=43.7384,7.4246` | Démarre GPS |
| **YouTube search** | `vnd.youtube:query=...` | App YouTube |
| **Spotify URI** | `spotify:track:xxx` | Lecture directe |
| **Telegram** | `tg://msg?text=...&to=@user` | DM Telegram |
| **Play Store** | `market://details?id=com.app.package` | Install app |
| **Browser tab** | `intent:https://url#Intent;end` | Force new tab |
| **Calendar add** | `content://com.android.calendar/events` | Add event |
| **Wi-Fi settings** | `intent:#Intent;action=android.settings.WIFI_SETTINGS;end` | Direct WiFi panel |
| **Bluetooth settings** | `intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end` | Direct BT panel |
| **Airplane mode** | `intent:#Intent;action=android.settings.AIRPLANE_MODE_SETTINGS;end` | Direct |
| **Battery saver** | `intent:#Intent;action=android.settings.BATTERY_SAVER_SETTINGS;end` | Direct |

---

## 🤖 Automation apps (webhook-triggered Android actions)

### 1. **Tasker** (4€ one-time, le plus puissant)
- Écoute webhooks via HTTP Request Shortcuts
- Actions : envoi SMS, changer son volume, activer WiFi, lancer app, lire TTS
- AutoRemote plugin → Apex envoie webhook → Tasker reçoit → exécute profile
- Site : https://tasker.joaoapps.com/

### 2. **Automate** (gratuit, Free tier 30 blocks)
- Flowchart visuel pour automation
- HTTP request block écoute webhooks
- Community marketplace flows
- Gratuit jusqu'à 30 "blocks" → suffisant pour flows simples

### 3. **MacroDroid** (freemium)
- Triggers HTTP + GPS + heure + détection app
- Simple UI pour non-dev
- Gratuit jusqu'à 5 macros puis 3€

### 4. **HTTP Shortcuts** (gratuit, open source)
- Crée icône sur home screen qui déclenche HTTP GET/POST
- Variable substitution
- Apex peut générer un deep link → Kevin colle dans HTTP Shortcuts → widget

### 5. **Pushover Notifications** (5€ one-time)
- Webhook → notification push sur tous devices
- Plus fiable que FCM natif pour webhooks

---

## 🔧 TWA (Trusted Web Activity) — Play Store

Si Kevin veut Apex sur le Play Store Lenovo/Android :

1. **Bubblewrap CLI** (Google tool) : `npx @bubblewrap/cli init --manifest=...`
2. Génère APK signé depuis PWA existante
3. Upload sur Play Console (25$ frais unique)
4. Publier en test interne d'abord

Avantages TWA vs PWA pure :
- Icône Play Store officielle
- Updates via Play Store auto
- Splash screen custom Android
- Push notifications FCM natif

Inconvénients :
- Frais Play Store 25$
- Review process 1-7j
- Modifications nécessitent update APK

---

## 🔌 ADB Wireless (contrôle avancé)

Si Kevin active **Debug USB Wireless** (Android 11+) sur sa Lenovo :
- Connect depuis PC via `adb connect 192.168.1.x:5555`
- Execute commandes shell : `adb shell input keyevent KEYCODE_POWER`
- Apex peut piloter SI wrappé dans app Cordova/Tauri OU via un bridge local
- Usage pratique : Kevin n'a pas besoin, mais possible

### Shizuku (élévation sans root)
- App Shizuku donne permissions ADB à d'autres apps sans root
- Un plugin Tasker+Shizuku peut exécuter commandes système
- Kevin peut activer certaines actions "root-like" sans jailbreak

---

## 🏭 Lenovo spécifique (tablettes 2026)

### SDK Lenovo Productivity Suite
- API specific Lenovo Yoga Tab / Legion Tab
- Mode "PC Mode" desktop-like
- Stylus pressure API (si Lenovo Precision Pen)
- Multi-window avancé

### Alternatives si Kevin change
- **Samsung DeX** (Galaxy Tab) : bureau Android complet
- **Xiaomi HyperOS** (Xiaomi Pad 6 Pro) : intégration écosystème Mi
- **Honor Magic Tab** : Huawei/Honor ecosystem
- **Pixel Tablet** : pur Android, zéro bloat

---

## 🎯 Top 15 features Apex doit ajouter pour Android users

1. **Web NFC tag reader/writer** → tap tag → action Apex
2. **Web Bluetooth scanner** → découvre appareils alentour
3. **Web Share Target** → Apex apparaît dans "Partager" système
4. **Background Sync** → sync Firebase en arrière-plan
5. **Contact Picker** → "Envoyer à..." depuis carnet natif
6. **Web OTP** → auto-fill code SMS confirmation
7. **Payment Request + Google Pay** → checkout natif
8. **Badging API** → badge messages non-lus sur icône
9. **Shape Detection** (barcode/QR/text) → scanner produits
10. **Webhook Tasker endpoint** → Apex trigger macros Android
11. **Intent URL generator** → crée lien custom pour user
12. **Gyroscope gesture detection** → secouer tablette = action
13. **Ambient Light auto-theme** → dark/light auto
14. **File System Access** → écrit backup local direct
15. **TWA deploy** → publier sur Play Store Lenovo

---

## 📚 Références

- Web Bluetooth : https://webbluetoothcg.github.io/web-bluetooth/
- Intent URLs : https://developer.chrome.com/docs/multidevice/android/intents/
- Tasker : https://tasker.joaoapps.com/userguide/en/
- TWA Bubblewrap : https://github.com/GoogleChromeLabs/bubblewrap
- PWA Android capabilities : https://whatpwacando.today/

---

**Dernière MAJ** : 2026-04-21 par Claude Code (v12.33 roadmap)

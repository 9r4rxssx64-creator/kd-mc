# UNIVERSAL_REMOTE.md — Télécommande Universelle Apex AI (couteau suisse)

> **Créé** : 2026-04-21 par Claude Code (Kevin demande : "je veux piloter n'importe quel appareil")
> **Objectif** : Apex AI devient télécommande universelle pour TOUS les appareils autour de Kevin

---

## 🎯 Architecture recommandée

```
┌─────────┐    HTTP/WSS    ┌──────────────────┐    protocoles    ┌──────────┐
│ Apex AI │ ─────────────▶ │ Home Assistant   │ ───────────────▶ │  Devices │
│  PWA    │                │ (local ou cloud) │  IR/RF/BLE/Zig    │  toutes  │
└─────────┘                └──────────────────┘  Wave/Matter     │  marques │
                                     │                            └──────────┘
                                     ├─────▶ Broadlink RM4 Pro (IR/RF 433MHz)
                                     ├─────▶ Zigbee dongle Conbee II
                                     ├─────▶ Matter/Thread (natif 2026)
                                     └─────▶ Wi-Fi devices (REST direct)
```

**Recommandation** : **Home Assistant est le hub central**. Apex parle HTTP REST à HA, HA gère tous les protocoles.

---

## 📺 Smart TVs — par marque

### Samsung TV (Tizen) ✅ API locale

```javascript
// Via WebSocket — pas besoin de cloud
async function samsungTVCmd(ip, key, cmd) {
  const ws = new WebSocket(`wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${btoa("Apex")}&token=${key}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      method: "ms.remote.control",
      params: {Cmd: "Click", DataOfCmd: cmd, Option: "false", TypeOfRemote: "SendRemoteKey"}
    }));
  };
}
// Commandes : KEY_POWER, KEY_VOLUP, KEY_VOLDOWN, KEY_MUTE, KEY_HOME, KEY_NETFLIX, KEY_ENTER, KEY_UP, KEY_DOWN...
```
**Pairing** : première connexion → TV affiche popup "Autoriser ?" → oui → token sauvé.

### LG WebOS ✅ API locale

```javascript
// Via WebSocket port 3000
async function lgWebOSCmd(ip, key, cmd) {
  const ws = new WebSocket(`ws://${ip}:3000`);
  ws.onopen = () => {
    ws.send(JSON.stringify({type: "register", payload: {"client-key": key}}));
    ws.send(JSON.stringify({
      id: 1,
      type: "request",
      uri: `ssap://${cmd}` // ex: "audio/volumeUp"
    }));
  };
}
```
Lib JS : `lgtv2` (Node) → port navigateur possible.

### Sony Bravia ✅ REST HTTP (PSK)

```javascript
async function sonyCmd(ip, psk, cmd) {
  return fetch(`http://${ip}/sony/IRCC`, {
    method: "POST",
    headers: {"X-Auth-PSK": psk, "Content-Type": "text/xml"},
    body: `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${cmd}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`
  });
}
```

### Roku ✅ ECP simple HTTP

```javascript
// Le plus simple de tous
async function rokuCmd(ip, cmd) {
  return fetch(`http://${ip}:8060/keypress/${cmd}`, {method: "POST"});
  // cmd: Home, Play, Select, Up, Down, Left, Right, Back, VolumeUp, Netflix
}
```

### Apple TV ⚠️ AirPlay 2 (limité PWA)

- AirPlay discovery via mDNS — Chrome seulement, pas Safari iOS PWA
- Workaround : passer par Home Assistant `pyatv` intégration → HA expose REST

### Chromecast / Google TV ✅ Cast API

```javascript
// Cast Web SDK
const context = cast.framework.CastContext.getInstance();
context.setOptions({receiverApplicationId: "CC1AD845"});
const session = await context.requestSession();
session.sendMessage("urn:x-cast:com.google.cast.media", {...});
```

### Autres : Hisense, TCL, Philips
- Tous supportent Alexa/Google → passer par HA + intégration vendor
- Souvent protocoles propriétaires → HA les abstrait

---

## 📡 Universal IR Blasters

### Broadlink RM4 Pro (recommandé, ~40€)
- Contrôle **IR + RF 433MHz** (shutters, garage)
- API locale via `python-broadlink` → exposé dans HA
- Code learning : pointe télécommande → learn → stock
- Apex envoie HTTP à HA → HA commande RM4 → blast IR/RF

### SwitchBot Hub 2 (~70€)
- Cloud API officielle OpenAPI (token Bearer)
- Matter natif en 2026
- Plus simple que Broadlink (pas de HA requis)

### Xiaomi Mi Smart Home Hub (~50€)
- Intégration Mi Home cloud
- Moins "ouvert" mais fonctionne avec HA

### DIY ESP32 + IR module (~10€)
- ESP32 (5€) + IR receiver/blaster (2€)
- Firmware ESPHome (free)
- Learn codes via n'importe quelle télécommande
- Expose HTTP REST → Apex appelle direct
- **Le plus custom + le moins cher**

---

## ⌚ Smart Watches

### Apple Watch
- **Via iPhone** : Apex envoie notification → iPhone relay → watch buzz
- **Via Shortcuts** : raccourci "Hey Siri, activer mode CMC" → watch HealthKit data → POST à Apex
- **Via HealthKit** : Shortcut périodique lit heart rate + sleep → envoie à Apex
- **Complication custom** : nécessite app Watch native (pas PWA)

### Wear OS (Samsung Galaxy Watch, Pixel Watch)
- **Tasker Wear plugin** : triggers depuis watch
- **Watch notifications via FCM** : notification push arrive auto sur watch

### Garmin Connect IQ
- SDK gratuit Connect IQ
- Peut créer widget qui fetch Apex API
- Usage niché : sports Kevin

### Fitbit
- API Web officielle (OAuth)
- Apex lit steps/heart rate → briefing matinal

### Xiaomi Mi Band / Amazfit
- Via app **Gadgetbridge** (Android) → lit données + envoie notifications
- Gratuit open source

---

## 🔊 Smart Speakers

### Sonos ✅ Cloud + Local
- API officielle `api.sonos.com` + local UPnP
- Node.js lib `sonos` (peut porter en browser)
- Queue, play, volume, group

### Amazon Echo / Alexa
- Custom Skill : Apex envoie webhook → Alexa TTS
- Alexa Routines : déclenche par phrase → hit webhook Apex

### Google Home / Nest
- Cast API pour audio
- Assistant routines → webhook

### Apple HomePod
- AirPlay 2 via Shortcuts
- SiriKit (app native requise)

### Yamaha MusicCast, Denon HEOS
- API locale HTTP native → Apex parle direct

---

## 🌐 Protocoles — choisir selon device

| Protocole | Portée | Coût hub | Standards | Usage 2026 |
|-----------|--------|----------|-----------|------------|
| **IR infrarouge** | Pièce | 40€ Broadlink | Universel | TV, AC, vieux |
| **RF 433MHz** | Maison | Inclus Broadlink | Rolling/fixed code | Portes, shutters |
| **Bluetooth BLE** | 10m | 0€ (direct PWA) | GATT | Écouteurs, cardio, balance |
| **Zigbee** | 30m mesh | 50€ dongle | Standard | Ampoules, sensors Xiaomi, Aqara |
| **Z-Wave** | 30m mesh | 50€ stick | Standard US/EU | Serrures, sensors premium |
| **Matter/Thread** | 30m mesh | Hub Apple/Google/Amazon | Nouveau 2024+ | Futur de tout |
| **Wi-Fi** | Réseau | 0€ | HTTP REST | Modernes (TVs, thermostats) |
| **MQTT** | Réseau | 0€ | Pub/sub | Domotique custom |

---

## 🏠 Configuration optimale pour Kevin

### Setup recommandé (~250€ total)

| Item | Prix | Rôle |
|------|------|------|
| **Home Assistant** (Docker sur Synology) | 0€ | Hub central |
| **HA Green** hardware (si pas Synology) | 95€ | Alternative clé en main |
| **Broadlink RM4 Pro** | 40€ | IR + RF universel |
| **Conbee II USB** | 50€ | Dongle Zigbee |
| **Matter Controller** | 0€ (natif HA 2026) | Matter/Thread |
| **HA Voice Preview Edition** | 60€ | Assistant vocal local |

**Total : ~250€** → Kevin contrôle depuis Apex :
- TV (Samsung/LG/Sony/Roku/Chromecast natif)
- IR : AC, ampli, ventilateur, chauffage ancien
- RF : shutters, portail, garage
- Zigbee : ampoules, sensors, switches
- BLE : cardio, balance, écouteurs
- Wi-Fi : thermostat, frigo, four modernes
- Matter : futur devices

### Setup budget (~100€)

- Broadlink RM4 Pro 40€ + ESP32 DIY 10€ + un Raspberry Pi 4 50€
- Home Assistant sur le Pi
- Zigbee si besoin plus tard (+50€)

### Setup ultra-light (~70€)

- **SwitchBot Hub 2** 70€ uniquement → cloud API direct, pas de HA
- Contrôle IR + RF + quelques BLE
- Limité mais prêt en 10 min

---

## 🎮 Implémentation Apex v12.33 — Tab "Télécommande Universelle"

### UI proposée

```
┌─────────────────────────────────────┐
│ 🎮 Télécommande Universelle         │
│                                     │
│ 📺 TV                               │
│ [Power] [Vol+] [Vol-] [Mute] [Src] │
│ [Netflix] [YouTube] [Home] [Back]   │
│                                     │
│ ❄️ Climatisation                    │
│ [On] [Off] [Cool] [Heat]           │
│ [Temp+] [Temp-] 22°C                │
│                                     │
│ 💡 Lumières                         │
│ [Salon: ON] [Chambre: OFF] [Dim]    │
│                                     │
│ 🔊 Son                              │
│ [Play] [Pause] [Next] [Prev]        │
│                                     │
│ 🏠 Scènes                           │
│ [Cinéma] [Soirée] [Nuit] [Boulot]   │
│                                     │
│ 🔍 Scanner nouveau device           │
│ [Bluetooth] [Wi-Fi] [Zigbee]        │
└─────────────────────────────────────┘
```

### Outils IA à ajouter (v12.33)

- `tv_control(brand, ip, cmd)` : envoie commande TV quelconque
- `ac_control(action, temp)` : AC via IR
- `lights_set(room, state, brightness)` : via Zigbee/Wi-Fi
- `sound_play(device, uri)` : Sonos/Cast
- `scene_activate(name)` : "Cinéma" = TV on + lights dim + AC 22°
- `watch_notify(msg)` : buzz Apple Watch via iPhone push
- `device_scan()` : BLE + Wi-Fi + mDNS discovery
- `ir_learn(name)` : apprendre code IR depuis télécommande physique
- `ha_call(entity, service, data)` : appel générique Home Assistant

---

## 📊 Top 30 devices Apex doit supporter (priorité)

| # | Device type | Protocole | Effort |
|---|-------------|-----------|--------|
| 1 | TV Samsung | Tizen WS | 🟢 Simple |
| 2 | TV LG | WebOS WS | 🟢 Simple |
| 3 | TV Sony Bravia | REST PSK | 🟢 Simple |
| 4 | Roku / Roku TV | ECP HTTP | 🟢 Simple |
| 5 | Chromecast | Cast API | 🟡 Moyen |
| 6 | Apple TV | AirPlay2 via HA | 🟠 HA requis |
| 7 | Broadlink RM4 | HA | 🟢 Via HA |
| 8 | AC (n'importe) | IR blaster | 🟢 Via HA |
| 9 | Sonos | HTTP direct | 🟢 Simple |
| 10 | HomePod | AirPlay | 🟠 Shortcuts |
| 11 | Alexa Echo | Webhook Skill | 🟡 Moyen |
| 12 | Google Home | Cast | 🟡 Moyen |
| 13 | Philips Hue | API REST | 🟢 Simple |
| 14 | Apple Watch | iPhone relay | 🟢 Simple |
| 15 | Wear OS | FCM notif | 🟢 Simple |
| 16 | Garmin | Connect IQ SDK | 🔴 Lourd |
| 17 | Fitbit | Web API OAuth | 🟢 Simple |
| 18 | Mi Band | Gadgetbridge | 🟡 Android only |
| 19 | Tesla | API unofficial | 🟡 Moyen |
| 20 | Bosch Home Connect | API officielle | 🟢 Simple |
| 21 | Xiaomi devices | Mi Home | 🟡 Cloud req |
| 22 | Aqara sensors | Zigbee | 🟢 Via HA |
| 23 | Shutters RF 433 | Broadlink RF | 🟢 Via HA |
| 24 | Garage opener | RF 433 | 🟢 Via HA |
| 25 | Door lock smart | Z-Wave | 🟢 Via HA |
| 26 | Thermostat Nest | Works With Nest (Google) | 🟡 Moyen |
| 27 | IP camera | RTSP / ONVIF | 🟡 Stream limité browser |
| 28 | PS5 | PSN unofficial | 🔴 Limité |
| 29 | Xbox | Smartglass déprécié | 🔴 Limité |
| 30 | Smart fridge | Samsung/LG API | 🟡 Niche |

---

## 🔐 Sécurité

- Tokens devices stockés `localStorage` (ax_tv_samsung_token, etc.)
- JAMAIS token dans URL (logs)
- HTTPS obligatoire si Apex parle à device externe (pas LAN)
- Home Assistant : token long-lived avec expiration + rotation annuelle

---

## 🎯 Recommandation finale Kevin

**Budget 250€ (setup ultime)** :
1. Acheter Home Assistant Green hardware (95€)
2. Ajouter Broadlink RM4 Pro (40€)
3. Dongle Zigbee Conbee II (50€)
4. HA Voice Preview (60€ optionnel)

→ Apex contrôle **TOUT** ce qui a un protocole standard.
→ Je code le pont Apex ↔ HA dans v12.33 (100 lignes JS max).
→ Tu ajoutes les devices dans HA (interface simple), Apex les détecte auto.

**Budget 70€ (setup rapide)** :
1. SwitchBot Hub 2 (70€) → cloud API, pas de HA
2. Apex parle direct au cloud SwitchBot via token
3. Contrôle IR + RF + quelques BLE Xiaomi

Les 2 sont compatibles → tu peux commencer par SwitchBot, puis évoluer vers HA plus tard.

---

**Dernière MAJ** : 2026-04-21 par Claude Code (v12.33 roadmap)

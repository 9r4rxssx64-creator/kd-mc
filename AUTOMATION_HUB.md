# AUTOMATION_HUB — Ecosysteme cross-platform pour Apex PWA (2026)

> Objectif : permettre a Apex (PWA client-side) de piloter tous les appareils de Kevin
> (iPhone, tablette Android Lenovo, Mac/PC, objets connectes) via webhooks / APIs ouvertes.
> Ce document recense les 10 briques incontournables en 2026, cout, setup, et patterns d'integration.

---

## 1. Home Assistant (HA) — le hub universel

**Ce que c'est** : OS open-source (Docker, RPi, NUC, Synology) qui unifie **3000+ integrations**
(iOS/Android companion apps, Matter, Zigbee, Z-Wave, HomeKit, Google Home, Alexa, Philips Hue,
Sonos, robots aspirateurs, thermostats, cameras, TV LG/Samsung, IR blasters Broadlink, etc.).

| Point | Detail |
|-------|--------|
| Cout | **Gratuit self-hosted** / **$7.50/mois** HA Cloud (acces distant sans VPN + Alexa/Google) |
| Setup | 1h sur RPi4 (HAOS image) ou Docker one-liner. Mode Supervised recommande. |
| API | REST `/api/services/<domain>/<service>` avec Bearer token (Long Lived Access Token) |
| Protocoles | Matter, Zigbee (via Sonoff ZBDongle-E ~25 EUR), Z-Wave, BLE, WiFi, Thread |

**Integration Apex** :
```
Apex PWA                     Home Assistant (local ou HA Cloud)
  |                                 |
  | POST /api/services/light/turn_on
  | Authorization: Bearer <token>   |
  | { "entity_id": "light.salon" }  |
  |-------------------------------->| -> Zigbee coordinator -> ampoule
  |<--------------------------------| 200 OK
```

Kevin : hub central. Tout le reste du document s'y branche.

---

## 2. IFTTT / Zapier / Make / n8n — les orchestrateurs webhook

| Outil | Free tier 2026 | Prix pro | Webhooks | Force |
|-------|---------------|----------|----------|-------|
| **n8n** (self-hosted) | Illimite | Gratuit si self-host | Natif | **Le meilleur**, open-source, AI-nodes |
| **Make** (ex-Integromat) | 1000 ops/mois | 9 EUR/mois | Natif | UI visuelle superieure |
| **Zapier** | 100 tasks/mois | 19.99 USD/mois | Pro only | Plus d'integrations (7000+) |
| **IFTTT Pro** | 2 applets | 3.99 USD/mois | Via Webhooks service | Simple, iOS/Android natif |

**Pattern Apex -> IFTTT** :
```
Apex : fetch("https://maker.ifttt.com/trigger/apex_event/with/key/<KEY>",
             { method:"POST", body: JSON.stringify({value1:"x"}) })
  -> declenche applet IFTTT -> notification iPhone / allume ampoule / tweet / etc.
```

Recommandation Kevin : **n8n self-hosted sur Synology/Docker** (gratuit, illimite, AI builtin).

---

## 3. ESPHome / Tasmota — firmware DIY sur ESP32/ESP8266

ESPHome (officiel HA) ou Tasmota transforment un module Sonoff / Shelly / ESP32 generic
(~5-15 EUR la piece) en peripherique smart home controle via MQTT ou API REST locale.

| Critere | ESPHome | Tasmota |
|---------|---------|---------|
| Config | YAML declaratif | Web UI + rules |
| Integration HA | Native (discovery) | MQTT |
| Cout hardware | 5-15 EUR (ESP32/ESP8266) | Idem |

Use case Kevin : **prise connectee qui coupe la TV apres 23h** (ESP32 + relais 2 EUR).

---

## 4. Telecommandes universelles IR/RF

| Produit | Prix 2026 | API HTTP | Notes |
|---------|-----------|----------|-------|
| **Broadlink RM4 Pro** | ~40 EUR | Via HA integration (cloud ou local) | IR + RF 433MHz, apprend n'importe quelle telecommande |
| **SwitchBot Hub 2** | ~70 EUR | API REST officielle (OpenAPI) | IR + capteur temp/hygrometrie, Matter 2026 |
| **Xiaomi Mi Smart Home Hub** | ~35 EUR | Requiert Xiaomi Home (restreint UE) | Ecosysteme Aqara |

**Gagnant pour Kevin** : **SwitchBot Hub 2**. API officielle tokenisee, pas de cloud chinois,
Matter natif, appairage direct Apex sans HA intermediaire si desire.

---

## 5. NFC tags + iOS Shortcuts / Android Automate

Tag NTAG215 (~0.20 EUR/piece, pack 50 = 10 EUR). Ecris une URL https://apex.kevin.app/?action=coffee
avec l'app iOS Raccourcis ou Android NFC Tools.

```
Kevin tape son iPhone sur le tag "Cafe" colle sur la machine
  -> iOS ouvre l'URL -> Apex detecte ?action=coffee
  -> POST webhook HA -> cafetiere ON + lumiere cuisine + musique douce
```

Setup : 5 min / tag. ROI : enorme.

---

## 6. Self-hosting — Proxmox / Docker / Synology

| Solution | Pour qui | Cout | Bon pour Apex |
|----------|----------|------|---------------|
| **Synology DS224+** | Debutant NAS | 300 EUR + HDD | Docker OK, backup photos, Plex, HA, n8n |
| **Proxmox VE** | Power user | Gratuit (PC recycle) | Multi-VM, snapshots, HA cluster |
| **Docker Compose** | Dev | Gratuit | Deploiement rapide Apex backend |

Replace Cloudflare Workers : **Hono/Bun** container + **Caddy** reverse proxy = full control.
Trade-off : IP fixe / DynDNS requis, maintenance 1h/mois.

---

## 7. Presence detection — Bluetooth beacons / UWB

| Tech | Gamme | Cout | Usage Kevin |
|------|-------|------|-------------|
| **iBeacon BLE** | 10-70m | 15 EUR/beacon | Detecte arrivee a la maison/bureau |
| **UWB (AirTag, Tile)** | 10m precis cm | 35 EUR (AirTag) | Localisation precise piece-par-piece |
| **ESPresense** (ESP32) | Triangulation multi-room | 15 EUR x N | Pieces de la maison, open-source |

**Pattern** : iPhone emet BLE -> ESP32 ESPresense dans chaque piece detecte RSSI ->
HA sait dans quelle piece est Kevin -> Apex recoit webhook -> UI adapte (theme sombre chambre).

---

## 8. Cameras IP — API HTTP / RTSP

| Marque | API | RTSP | Integration HA | Prix |
|--------|-----|------|---------------|------|
| **Reolink** | OpenAPI tokenise | Oui | Native (Reolink Go) | 70-200 EUR |
| **Ubiquiti UniFi Protect** | API complete | Oui | UniFi integration | 400 EUR+ (NVR) |
| **Hikvision** | ISAPI | Oui | Hikvision integration | 100-300 EUR |

**Recommandation Kevin** : Reolink E1 Pro (80 EUR) + HA frigate add-on (IA locale detection
personne/voiture sur GPU). Apex peut afficher snapshot via `/api/camera_proxy/camera.front_door`.

---

## 9. Voice assistants — au-dela de Siri/Google

| Assistant | Self-host | Vie privee | Compatible Apex |
|-----------|-----------|------------|-----------------|
| **Alexa Custom Skill** | Non (AWS) | Moyen | Oui via Skill + webhook |
| **Willow** (ESP32-BOX) | Oui | Excellent | Oui via HA |
| **Home Assistant Voice** (2024+) | Oui, device 60 EUR | Excellent | Natif |
| **Mycroft / OVOS** | Oui | Excellent | API plugin |

**Gagnant 2026** : **Home Assistant Voice Preview Edition** (60 EUR, wake word local,
STT Whisper local, TTS Piper local, LLM optionnel local via Ollama).

---

## 10. Cross-device clipboard / share

| Outil | iOS | Android | Mac | Windows | Linux |
|-------|-----|---------|-----|---------|-------|
| **KDE Connect** | Limite | Oui | Oui | Oui | Oui |
| **Microsoft Phone Link** | Non | Oui | Non | Oui | Non |
| **Apple Universal Clipboard** | Oui | Non | Oui | Non | Non |
| **LocalSend** (open-source) | Oui | Oui | Oui | Oui | Oui |

Apex peut exposer endpoint `/clip` avec service worker background sync :
le copier-coller passe de l'iPhone a la tablette Android en 1s via WebSocket local.

---

## Diagramme integration globale

```
               +----------------------+
               |    Apex PWA (iOS,    |
               |  Android, desktop)   |
               +----------+-----------+
                          |
           +--------------+---------------+
           |              |               |
           v              v               v
    +----------+   +------------+   +-----------+
    | Webhook  |   | Home       |   | SwitchBot |
    |  router  |   | Assistant  |   |   API     |
    | (n8n)    |   |  REST API  |   |  Cloud    |
    +----+-----+   +-----+------+   +-----+-----+
         |               |                |
  +------+----+   +------+------+         |
  |           |   |             |         |
  v           v   v             v         v
 IFTTT     Slack  Zigbee     Matter     IR appliances
 Zapier   Discord  Z-Wave    HomeKit    (TV clim)
                   BLE        Alexa
                    \        /
                     \      /
              ESPHome (ESP32/8266)
              presence (ESPresense)
              cameras (Reolink/frigate)
```

---

## Top 10 automations Apex pour Kevin — classees par ROI

| # | Automation | Valeur | Effort setup | ROI |
|---|-----------|--------|--------------|-----|
| 1 | Arrivee maison (geofence iPhone) -> HA : lumieres + chauffage + musique | Tres haute | 20 min | 10/10 |
| 2 | NFC tag "Bureau CMC" -> mode travail (focus iOS + timers + Apex shift) | Haute | 10 min | 10/10 |
| 3 | Bouton Apex "Cinema" -> TV + ampli + lumiere 20% + volets | Haute | 30 min | 9/10 |
| 4 | Voix HA local "Apex reveille-moi a 6h" -> alarme + cafetiere + volets | Haute | 1h | 9/10 |
| 5 | Detection sommeil (Apple Watch -> HA) -> chauffage nuit + veilleuse douce | Moyenne | 30 min | 8/10 |
| 6 | Camera sonnette Reolink -> Apex push photo + intercom 2-way | Haute | 45 min | 8/10 |
| 7 | Ouverture frigo > 2 min -> Apex alerte iPhone (capteur Aqara 15 EUR) | Moyenne | 15 min | 8/10 |
| 8 | Fin de shift Apex -> mode "rentre a la maison" (clim prechauffe, Spotify) | Haute | 20 min | 8/10 |
| 9 | Pres du lit la nuit (ESPresense) -> dimmer auto ecran + mode lecture | Moyenne | 1h | 7/10 |
| 10 | Clipboard iPhone -> tablette Lenovo via LocalSend + Apex UI unifiee | Moyenne | 30 min | 7/10 |

---

## Securite

- Tokens HA en **localStorage chiffre** cote Apex (AES-GCM via WebCrypto)
- Whitelist domaines webhook cote CSP
- Rate limit cote n8n (max 60 req/min par source)
- Kill switch Apex -> POST `/api/services/automation/turn_off all`
- Audit log des webhooks declenches (cmc_automation_audit)

---

Fichier genere le 2026-04-21 — a mettre a jour quand HA Voice v3 sort (Q3 2026).

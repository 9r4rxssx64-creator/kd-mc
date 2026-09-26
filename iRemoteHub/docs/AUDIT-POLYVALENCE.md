# Audit polyvalence & multi-format

## Top 20 extensions prioritaires

| # | Extension | Effort | Valeur | Phase |
|---|-----------|--------|--------|-------|
| 1 | Zigbee2MQTT | M | ★★★★★ | v0.2 |
| 2 | Z-Wave (zwave-js) | M | ★★★★★ | v0.2 |
| 3 | Matter (@project-chip/matter.js) | M | ★★★★★ | v0.2 |
| 4 | Home Assistant REST | S | ★★★★★ | v0.2 |
| 5 | Logitech Harmony import | S | ★★★★ | v0.2 |
| 6 | Apple Watch companion | M | ★★★★ | v0.3 |
| 7 | CarPlay / Android Auto | L | ★★★★ | v0.3 |
| 8 | Sub-GHz 868MHz (ESPHome) | M | ★★★★ | v0.3 |
| 9 | NFC/RFID Tap (iOS Shortcuts natif) | S | ★★★ | v0.2 |
| 10 | OpenHAB binding | M | ★★★★ | v0.3 |
| 11 | Desktop PWA Electron | L | ★★★★ | v0.3 |
| 12 | HDMI-CEC (libcec) | M | ★★★★ | v0.3 |
| 13 | Librespot Spotify local | M | ★★★★ | v0.3 |
| 14 | Node-RED contrib package | M | ★★★★ | v0.3 |
| 15 | Multi-langue i18n (7 langues) | M | ★★★ | v0.2 |
| 16 | Voice Command Rhasspy | L | ★★★★ | v0.4 |
| 17 | Synology / QNAP package | M | ★★★★ | v0.3 |
| 18 | PDF cheat sheet | S | ★★ | v0.3 |
| 19 | HomeKit Secure Router | S | ★★ | v0.4 |
| 20 | Alexa Skills local | L | ★★★ | v0.4 |

## Couverture actuelle vs cible

| Domaine | v0.1 | Cible v1.0 |
|---------|------|-----------|
| Discovery | mDNS, SSDP, BLE, ARP | + Zigbee, Z-Wave, Matter, Thread |
| TV | Samsung, LG, Sony, Roku, Chromecast | + Vizio, Hisense, Panasonic, Philips |
| Audio | Sonos, Chromecast | + Bose, Denon, Yamaha, HEOS, AirPlay |
| Lumières | Hue | + LIFX, Yeelight, Wiz, Nanoleaf, Govee |
| Prises | TP-Link | + Shelly, Tasmota, Tuya, Meross |
| IR | BroadLink | + Tuya IR, Tasmota IR, Flipper Zero |
| Voiture | ❌ | Tesla API, OBD-II BLE |
| Mobilité | ❌ | e-bikes, trottinettes, drones |
| Gaming | ❌ | PS5, Xbox, Switch |
| Sécurité | ❌ | Nuki, Ring, Doorbird |
| Énergie | ❌ | SolarEdge, Enphase, Shelly EM, Linky |
| Langues | FR | + EN, ES, DE, IT, AR, ZH, JA |
| Plateformes | iPhone, Android | + Watch, CarPlay, Smart TV, Desktop |

## Métrique de succès

- v0.1 : 12 marques → couvre ~35% foyers tech.
- v0.2 : +Zigbee2MQTT + Z-Wave + Matter + HA → ~75% foyers connectés.
- v1.0 : 50+ marques + 7 langues + 5 plateformes → vraiment universel.

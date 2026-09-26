# Audit hardware — couverture actuelle vs cible "universelle"

> Synthèse de l'audit expert multi-agents. Mis à jour au fur et à mesure.

## Couvert en v0.1

| Catégorie | Adapters |
|-----------|----------|
| TV | Samsung Tizen, LG WebOS, Sony Bravia, Chromecast (via Cast) |
| Audio | Sonos, Chromecast Audio |
| Box/streaming | Roku, Chromecast, Apple TV (via Raccourci) |
| Lumières | Philips Hue |
| Prises | TP-Link Kasa |
| IR | BroadLink RM4 |
| Générique | HTTP GET/POST, Wake-on-LAN |

## Top priorités à ajouter (P0/P1)

### P0 — Urgence
- **Matter** (`@project-chip/matter.js`) — standard unifié 2024+, couvre déjà 1000+ appareils.

### P1 — Essentiel (30+ % des foyers concernés)
- **Z-Wave** (`zwave-js`) — 30% foyers connectés US.
- **Gaming** : PS5 (WoL + Remote Play), Xbox Series (`xbox-smartglass-halo`).
- **Tesla API** (`tesla-api`) — EV leader.
- **Roomba** (`dorita980`) — MQTT local.
- **Dyson** (`node-dyson`) — MQTT local 8883.
- **Serrures** : Nuki (`nuki-smart-lock`), August.
- **Énergie solaire** : SolarEdge / Enphase (Modbus TCP via `modbus-serial`).
- **Sonnettes** : Ring, Doorbird (MQTT/REST).

### P2 — Souhaité
- OBD-II BLE (voiture générique).
- E-bikes (Bosch eBike, Shimano Steps — BLE GATT).
- Trottinettes Xiaomi/Ninebot (BLE).
- Drones DJI / Parrot (UDP SDK).
- Cafetières premium (Delonghi, Sage — BLE).
- Linky Teleinfo (dongle USB série 1200 bauds).
- Stations météo Netatmo / Ecowitt.
- Imprimantes IPP (`ipp`).
- NAS Synology / QNAP.
- Freebox (`freebox-api`).
- Routeurs Unifi / AsusWRT.
- Somfy Tahoma (volets, portails).

### P3 — Nice to have
- Tondeuses Husqvarna Automower.
- Arrosage Rachio / Hunter.
- Piscine Zodiac iAqualink.
- Four/lave-linge Samsung SmartThings.
- Miele@home / Home Connect Bosch.
- Médical : CPAP, glucomètres BLE, tensiomètres Omron, balances Withings.
- DMX (machines à fumée, scène).

## Protocoles manquants

| Protocole | Usage | Lib candidate | Effort |
|-----------|-------|---------------|--------|
| Matter | Standard unifié 2024+ | `@project-chip/matter.js` | L |
| Z-Wave | USA surtout | `zwave-js` | L |
| Modbus TCP | Industriel, onduleurs | `modbus-serial` | M |
| BACnet | Bâtiments tertiaires | `bacnet-stack` | L |
| ONVIF | Caméras IP | `onvif` | M |
| KNX | Domotique filaire premium | `knx` | L |
| DMX | Éclairage scénique | `dmx` | S |
| LoRaWAN | Capteurs longue portée | — (cloud ou passerelle) | XL |
| EnOcean | Sans pile | `node-enocean` | L |
| Sub-GHz 433MHz | Télécommandes RF simples | dongle RTL-SDR + `node-rtlsdr` | XL |

## Approche d'ajout

Un nouvel adapter = 1 fichier `bridge/adapters/<name>.js` implémentant `{ actions: {...} }`. Pattern identique : import lib optionnelle → fonctions → export. L'adapter est auto-chargé par `bridge/adapters/index.js` via détection dans `REGISTRY`.

Pour les adapters cloud-only (Samsung SmartThings, LG ThinQ, Tesla), un module `bridge/cloud/` distinct avec OAuth2 stockée dans `config.json`.

## Roadmap suggérée

- **v0.2** (court terme) : +P0 Matter, +P1 Nuki/Roomba/Dyson/Ring = couvre 80 % des foyers tech.
- **v0.3** : +Gaming (PS5/Xbox), +Tesla, +Z-Wave = enthusiastes.
- **v0.4** : +Industrial (Modbus/ONVIF/KNX), +Énergie (SolarEdge/Shelly EM/Linky) = pros/prosumers.
- **v1.0** : 50+ adapters, reconnaissance 500+ modèles via IA, communauté KB active.

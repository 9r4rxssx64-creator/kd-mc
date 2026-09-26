# Adapters — libs Node.js pour pilotage local multi-protocoles

> Trousse à outils complète : une lib recommandée par marque/protocole. Chaque adapter est un module `bridge/adapters/*.js` qui wrappe ces libs.

## TV

| Marque | Lib recommandée | Protocole | Code minimal |
|--------|-----------------|-----------|--------------|
| Sony Bravia | `@seydx/bravia` | IRCC + REST | `new Bravia({ip,psk}).power('on')` |
| Samsung Tizen | `samsung-tv-control` | WS :8001/:8002 + token | `new SamsungTV({ip,mac}).setVolume(30)` |
| LG WebOS | `lgtv2` (fork merdok) | WS :3000/:3001 | `tv.request('ssap://system/turnOff')` |
| Vizio SmartCast | `vizio-smart-cast` | HTTPS :7345 | `tv.power.on()` |
| Philips Ambilight | `ambilight` | JointSpace | `tv.setColor(255,0,0)` |
| Panasonic Viera | `node-panasonic-viera` | SOAP | `tv.powerOn()` |
| Hisense | direct `mqtt` port :36669 | MQTT | user `hisenseservice` |

## Box / streaming

| Appareil | Lib | Protocole |
|----------|-----|-----------|
| Roku | `@dlenroc/roku-ecp` | ECP :8060 |
| Chromecast | `castv2-client` | Cast TLS :8009 |
| Apple TV | `node-appletv` | Media Remote Protocol |
| Fire TV / Shield | `@cldmv/node-android-tv-remote` | ADB :5555 |

## Audio

| Appareil | Lib | Protocole |
|----------|-----|-----------|
| Sonos | `@svrooij/sonos` | SOAP :1400 |
| Bose SoundTouch | `node-soundtouch` | REST :8090 |
| Denon/Marantz HEOS | `marantz-denon-telnet` | Telnet :23 |
| Yamaha MusicCast | `yamaha-yxc-nodejs` | YXC API |
| AirPlay 2 | `nodetunes` (fork) | RTSP/RTP |

## Lumières

| Marque | Lib | Protocole |
|--------|-----|-----------|
| Philips Hue | `node-hue-api` v4 | Bridge REST |
| LIFX LAN | `lifx-lan-client` (fork) | UDP :56700 |
| Yeelight | `yeelight.js` | TCP :55443 |
| Wiz | `@suisse00/wiz-local-control` | UDP :38899 |
| Nanoleaf | `nanoleaves` | REST :16021 |

## Prises / énergie

| Marque | Lib | Note |
|--------|-----|------|
| TP-Link Kasa | `tplink-smarthome-api` | Stale (dernière 2023) |
| TP-Link Tapo | `tp-link-tapo-connect` | KLAP, maintenu ✅ |
| Shelly (gen3+) | `node-shellies-ng` | CoAP + REST |
| Tuya local | `tuyapi` | ⚠️ dev freezé |
| Meross | `@doekse/meross-iot` | REST local + cloud |

## Hubs / multi-protocoles

| Hub | Lib |
|-----|-----|
| HomeKit | `hap-controller-node` |
| Matter | `@project-chip/matter.js` |
| Home Assistant | `home-assistant-js-websocket` |
| MQTT générique | `mqtt.js` |
| Zigbee2MQTT | via MQTT topics |

## Infrarouge

| Hardware | Lib |
|----------|-----|
| BroadLink RM4 | `broadlinkjs-rm` |
| Tasmota IR | `mqtt.js` + topics `cmnd/{device}/IRsend` |
| Tuya IR | `tuyapi` DPS "send_ir" |

## Utilitaires

| Besoin | Lib |
|--------|-----|
| Wake-on-LAN | `wakeonlan` |
| HDMI-CEC | `hdmi-cec` (requires cec-client) |
| MQTT broker client | `mqtt` |

## Clone multi-format (voir `docs/CLONE.md`)

| Format | Hardware | Lib / API |
|--------|----------|-----------|
| NFC NDEF | Tablette Android (natif) | Web NFC API |
| MIFARE Classic UID | PN532 / Flipper Zero / Chameleon | `nfc-pcsc` / Flipper Mobile API |
| EM4100 / EM4102 / H10301 | Proxmark3 / Flipper | `proxmark3` CLI / Flipper BLE |
| IR Pronto / BroadLink b64 | BroadLink RM4 Pro | `broadlinkjs-rm` (déjà intégré) |
| Sub-GHz 433/868 MHz fixe | Flipper / CC1101 / RTL-SDR | `node-rtlsdr` / Flipper API |
| QR / DataMatrix | Caméra téléphone | `BarcodeDetector` API / ZXing-JS |
| BLE advertising | Host Linux du bridge | `@abandonware/noble` |

**Refusés par design** (hardcodé dans `bridge/adapters/clone.js`) : EMV, HID iClass SE, MIFARE DESFire, KeeLoq, Hitag2, Megamos, SIM, passeports, magstripe bancaire.

## Exemples d'intégration

### Sonos

```javascript
const { SonosDevice } = require('@svrooij/sonos');

const sonos = new SonosDevice('192.168.1.42');

async function sonosOff() {
  await sonos.Stop();
}

async function sonosVolume(vol) {
  await sonos.SetVolume(vol);
}

async function sonosSay(text) {
  await sonos.PlayTTS({ text, lang: 'fr-FR' });
}
```

### Roku

```javascript
const Roku = require('@dlenroc/roku-ecp');

const roku = new Roku({ ip: '192.168.1.55' });

await roku.press('home');
await roku.press('power');
await roku.launch('12'); // Netflix
```

### Philips Hue

```javascript
const hue = require('node-hue-api').v3;

const bridge = await hue.discovery.nupnpSearch();
const api = await hue.api.createLocal(bridge[0].ipaddress).connect(USERNAME);

const lights = await api.lights.getAll();
for (const light of lights) {
  await api.lights.setLightState(light.id, { on: false });
}
```

### Samsung Tizen

```javascript
const SamsungTV = require('samsung-tv-control').default;

const tv = new SamsungTV({
  ip: '192.168.1.60',
  mac: 'AA:BB:CC:DD:EE:FF',
  nameApp: 'iRemoteHub',
  debug: false,
});

await tv.isAvailable();
await tv.sendKey('KEY_POWEROFF');
```

### BroadLink IR

```javascript
const BroadLink = require('broadlinkjs-rm');

const broadlink = new BroadLink();
broadlink.discover();

broadlink.on('deviceReady', (dev) => {
  dev.checkData(); // "learn" : presser télécommande
  dev.on('rawData', (data) => {
    // sauver `data.toString('hex')` en base pour re-émission
  });
});

// Émission
dev.sendData(buffer);
```

## À éviter (abandonware / bugs majeurs)

- `tplink-smarthome-api` — Tapo non supporté, dernière MAJ 2023.
- `tuyapi` — dev gelé (mainteneur annonce).
- `node-lifx` (original) — utiliser le fork `lifx-lan-client`.

## Patterns fiables

1. **Discovery** : mDNS → SSDP → ARP → port scan ciblé.
2. **Auth** : pre-shared key ou pairing one-shot (token stocké).
3. **Retry** : backoff expo + circuit breaker.
4. **Timeout** : 5s par action, 2s pour ping.
5. **Logs** : winston + namespace par adapter.

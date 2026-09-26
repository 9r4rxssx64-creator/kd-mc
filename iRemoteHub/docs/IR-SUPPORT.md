# Support infrarouge — bases de codes & hardware

> L'iPhone n'a pas d'émetteur IR. On passe par un dongle WiFi (BroadLink RM4 recommandé), Tuya Smart IR, ou un Tasmota ESP8266 DIY.

## 1) Bases publiques de codes IR

### LIRC
- URL : https://lirc.sourceforge.net/remotes/
- Format `.conf` texte, ~38 kHz défaut.
- Couverture : TV (85%), clim (70%), décodeurs (65%).

### IRDB (probonopd)
- https://github.com/probonopd/irdb
- CSV `Marque/Catégorie/device,subdevice.csv`.
- CDN direct : `https://cdn.jsdelivr.net/gh/probonopd/irdb@master/codes/Samsung/TV/7,7.csv`.

### Flipper-IRDB (Lucaslhm)
- https://github.com/Lucaslhm/Flipper-IRDB
- Format `.ir` organisé `DeviceType/Brand/Series`.
- Compatible Flipper Zero directement.

## 2) Formats

| Format | Avantage | Usage |
|--------|----------|-------|
| Pronto HEX (`.ccf`) | Universel, portable | Stockage long terme |
| Raw microseconds `[500,1000,...]` | Exact, flexible | Fallback custom |
| BroadLink base64 (`JgCc...`) | Rapide à émettre | Hardware BroadLink |
| LIRC conf | Lisible, scriptable | Linux/scripts |

Convertisseurs Node : `broadlink-ir-converter` (Pronto ↔ BroadLink b64), `sensus` (GUI).

## 3) Hardware IR pilotable sans Mac

### BroadLink RM4 Pro / Mini ⭐ recommandé
- **WiFi 2.4 GHz** local UDP :80 (pas besoin cloud).
- **Lib Node** : `broadlinkjs-rm`.
- App iOS BroadLink pour l'apprentissage initial facile.
- ~40-80 €.

### Tuya Smart IR
- WiFi local via `tuyapi` (DPS `send_ir`).
- ~30-60 €.
- App TuyaSmart.

### Tasmota IR Bridge DIY
- ESP8266 + IR diode + firmware Tasmota.
- MQTT local 100% open source.
- ~10-15 €.
- Topics : `cmnd/<device>/IRsend` + JSON.

### Global Caché iTach
- TCP :4998, ASCII commands.
- Pro, 8 connexions simultanées.
- ~250 € (overkill pour usage perso).

### Flipper Zero
- Portable, apprentissage natif, `.ir` SD card.
- App mobile experimental iOS/Android.
- ~99 €.

### Android natif (certaines tablettes Xiaomi/Samsung/Huawei)
- API `android.hardware.ConsumerIrManager`.
- Termux n'y a PAS accès (pas d'API Java expose). Limite pour notre stack.

## 4) Procédure d'apprentissage BroadLink

```javascript
const BroadLink = require('broadlinkjs-rm');
const bl = new BroadLink();
bl.discover();

bl.on('deviceReady', (dev) => {
  console.log('Appareil trouvé :', dev.host.address);

  // Mode learn : l'utilisateur presse la touche télécommande
  dev.enterLearning();

  // Attente données (5-10 sec)
  setTimeout(() => {
    dev.checkData();
    dev.on('rawData', (data) => {
      const b64 = data.toString('base64');
      console.log('Code appris (base64) :', b64);
      saveButton('power', b64);
    });
  }, 5000);
});

function emit(buf) {
  dev.sendData(buf);
}
```

## 5) Schéma JSON recommandé (bridge/data/ir-codes.json)

```json
{
  "samsung-qn65q80c": {
    "brand": "Samsung",
    "model": "QN65Q80C",
    "category": "TV",
    "carrier_hz": 38000,
    "buttons": {
      "power": {
        "pronto": "0000 006D 0022 0082 015F ...",
        "broadlink_b64": "JgCcAQABJh9gHjog..."
      },
      "volume_up": { "pronto": "...", "broadlink_b64": "..." },
      "volume_down": { "pronto": "...", "broadlink_b64": "..." },
      "channel_up": { "pronto": "..." },
      "channel_down": { "pronto": "..." },
      "mute": { "pronto": "..." },
      "input": { "pronto": "..." }
    },
    "source": "IRDB",
    "last_updated": "2026-04-18"
  }
}
```

## 6) UI learning dans la PWA

- Bouton "🎓 Apprendre une touche" → formulaire (nom, icône).
- Appel bridge `POST /ir/learn` → bridge lance `dev.enterLearning()`.
- Utilisateur presse télécommande physique dans les 10 s.
- Bridge renvoie le code appris → sauvé dans `ir-codes.json`.
- Nouveau bouton ajouté à la télécommande virtuelle.

## 7) Stack recommandée iRemoteHub

| Besoin | Choix |
|--------|-------|
| Apprentissage simple | BroadLink RM4 Mini |
| Base de codes pré-remplie | Import IRDB (CSV → JSON converti) |
| Émission fiable | BroadLink b64 direct |
| Portabilité | Pronto HEX en backup |
| Budget max | Tasmota ESP8266 DIY |

## 8) Sources

- [LIRC](https://www.lirc.org/)
- [IRDB GitHub](https://github.com/probonopd/irdb)
- [Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB)
- [broadlinkjs-rm](https://github.com/lprhodes/broadlinkjs-rm)
- [Home Assistant BroadLink](https://www.home-assistant.io/integrations/broadlink/)
- [Tasmota IR docs](https://tasmota.github.io/docs/Tasmota-IR/)

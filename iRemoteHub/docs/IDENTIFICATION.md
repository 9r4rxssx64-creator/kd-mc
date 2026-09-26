# Identification des appareils inconnus sur réseau local

> Base de connaissances : empreintes, libs, APIs, patterns. Alimente le module IA.

## 1) Bases de données d'empreintes

### MAC OUI (constructeur par adresse MAC)

| Source | URL | Licence | Usage |
|--------|-----|---------|-------|
| IEEE OUI | https://standards-oui.ieee.org/oui/oui.csv | Public | Téléchargement CSV officiel |
| Wireshark manuf | https://www.wireshark.org/download/automated/data/manuf | GPL | Fichier texte tabulé |
| macvendors.com | https://api.macvendors.com/{MAC} | Free (1000/j) | Lookup instantané |
| macaddress.io | https://api.macaddress.io/v1 | Free tier | JSON complet |
| OUI Master DB | https://github.com/Ringmast4r/OUI-Master-Database | MIT | 87 970+ vendors (IEEE+Nmap+Wireshark) |

Exemple :
```bash
curl https://api.macvendors.com/00:0E:58:12:34:56
# → Sonos Inc.
```

### mDNS/Bonjour service types

Registre officiel : https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/NetServices/Articles/faq.html

Services communs :
- `_airplay._tcp.local` → Apple TV, HomePod, AirPlay speakers
- `_googlecast._tcp.local` → Chromecast, Google Home
- `_spotify-connect._tcp.local` → enceintes Spotify-ready
- `_sonos._tcp.local` → Sonos
- `_hap._tcp.local` → HomeKit accessory
- `_ssh._tcp.local` → Linux / Raspberry Pi / NAS
- `_ipp._tcp.local` → imprimantes AirPrint
- `_hue._tcp.local` → Philips Hue Bridge
- `_matter._tcp.local` / `_matterc._udp.local` → Matter devices

### SSDP/UPnP device types

| Device Type | Appareil probable |
|-------------|-------------------|
| `urn:schemas-upnp-org:device:ZonePlayer:1` | Sonos 99% |
| `urn:dial-multiscreen-org:service:dial:1` | Roku / Chromecast |
| `urn:schemas-sony-com:service:IRCC:1` | Sony Bravia |
| `urn:samsung.com:device:RemoteControlReceiver:1` | Samsung Tizen TV |
| `urn:lge-com:service:webos-second-screen:1` | LG WebOS TV |
| `urn:schemas-upnp-org:device:MediaRenderer:1` | DLNA speaker/TV générique |
| `upnp:rootdevice` | Appareil UPnP générique |

### BLE GATT services (Bluetooth SIG)

Registre : https://www.bluetooth.com/specifications/assigned-numbers/

UUIDs courts communs (16-bit) :
- `180A` Device Information
- `180F` Battery
- `180D` Heart Rate (montres fitness)
- `1816` Cycling Speed & Cadence
- `181E` Bond Management
- `1812` HID (clavier/manette BLE)
- `FE9F` Google Fast Pair
- `FEAA` Eddystone beacon
- `FD6F` Apple Continuity

Base téléchargeable : https://github.com/NordicSemiconductor/bluetooth-numbers-database

### DHCP fingerprints (Fingerbank)

API : https://api.fingerbank.org/api/v2/combinations/interrogate (1M requêtes/mois gratuites)

Envoyer `dhcp_fingerprint` (option 55 params) + `dhcp_vendor` (option 60) → OS/modèle.

## 2) Libs Node.js production-ready

### Découverte

| Lib | Rôle | Note |
|-----|------|------|
| `bonjour-service` | mDNS pur JS | TypeScript, moderne ✅ |
| `mdns-js` | mDNS sans dépendances natives | Stable ✅ |
| `node-ssdp` | SSDP M-SEARCH client/serveur | 300+ stars ✅ |
| `@achingbrain/ssdp` | SSDP alternative | UDP6 ✅ |
| `@abandonware/noble` | BLE scan | 2K+ stars, maintenu ✅ |
| `local-devices` | ARP + ping cross-platform | Simple ✅ |
| `evilscan` | Port scan + banner | Rapide ✅ |
| `node-nmap` | Wrapper nmap pour OS detect | Requires nmap ⚠️ |

### Exemple pipeline découverte (bridge)

```javascript
const Bonjour = require('bonjour-service').default;
const { Client: SsdpClient } = require('node-ssdp');
const localDevices = require('local-devices');
const fetch = require('node-fetch');

async function discoverAll() {
  const found = new Map(); // key = ip ou mac

  // 1. ARP sweep
  const arp = await localDevices();
  for (const d of arp) {
    found.set(d.ip, { ip: d.ip, mac: d.mac, sources: ['arp'], confidence: 10 });
  }

  // 2. mDNS
  const bonjour = new Bonjour();
  bonjour.find({}, (svc) => {
    const ip = svc.referer?.address || svc.addresses?.[0];
    const dev = found.get(ip) || { ip, sources: [], confidence: 0 };
    dev.mdns = (dev.mdns || []).concat([{
      name: svc.name, type: svc.type, port: svc.port, txt: svc.txt
    }]);
    dev.sources.push('mdns');
    dev.confidence += 25;
    found.set(ip, dev);
  });

  // 3. SSDP
  const ssdp = new SsdpClient();
  ssdp.on('response', (headers, status, rinfo) => {
    const ip = rinfo.address;
    const dev = found.get(ip) || { ip, sources: [], confidence: 0 };
    dev.ssdp = (dev.ssdp || []).concat([{ st: headers.ST, location: headers.LOCATION }]);
    dev.sources.push('ssdp');
    dev.confidence += 20;
    found.set(ip, dev);
  });
  ssdp.search('ssdp:all');

  await new Promise(r => setTimeout(r, 3000));

  // 4. Enrichir vendor depuis OUI
  for (const [ip, d] of found) {
    if (d.mac) {
      try {
        d.vendor = await fetch(`https://api.macvendors.com/${d.mac}`).then(r => r.text());
      } catch {}
    }
  }

  return [...found.values()];
}
```

## 3) Outils CLI à wrapper (bridge Termux)

- `arp-scan -l` (rapide, OUI lookup intégré)
- `avahi-browse -a -r -t` (Linux mDNS)
- `nmap -sV -O <ip>` (service/OS detect)
- `fping -g -a <subnet>` (ping sweep rapide)

## 4) Patterns d'identification avec scoring

| Critère | Poids | Exemple Sonos One |
|---------|-------|-------------------|
| MAC OUI match | 25% | `00:0E:58` → Sonos Inc ✓ |
| Port ouvert + service | 30% | `1400/tcp` HTTP Sonos ✓ |
| mDNS type | 20% | `_sonos._tcp.local` ✓ |
| SSDP Device Type | 15% | `urn:schemas-upnp-org:device:ZonePlayer:1` ✓ |
| Banner HTTP | 10% | `Server: Linux UPnP/1.0 Sonos/73.2` ✓ |

→ Confiance 100% ⇒ identification "Sonos" certaine.

## 5) Cas d'usage concrets

### Sonos
- OUI `00:0E:58` + port `1400` + SSDP `ZonePlayer:1` → **99%**.

### Chromecast
- OUI `6C:AD:F8`/`54:60:09` (Google) + port `8008/8009` + mDNS `_googlecast._tcp.local` → **95%**.

### Roku
- mDNS `_rokutv._tcp.local` + port `8060/tcp` → **95%**.

### iPhone
- BLE advertisement Apple Continuity (`FD6F`) + RSSI fort + mDNS hostname "iPhone-*" → **90%**.

### Appareil inconnu
- OUI seul → vendor probable, catégorie floue. Déclencher l'IA.

## 6) Alimentation de la base locale

Fichier `bridge/data/kb.sqlite` (auto-créé) :
- Stocke chaque fingerprint_hash + identification + confiance.
- Feedback utilisateur → `user_confirmed = 1` boost future lookups.
- Export JSON anonyme possible pour partage communautaire (opt-in).

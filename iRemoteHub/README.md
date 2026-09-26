# iRemoteHub

> Télécommande universelle multi-appareils — pilotez tout ce qui vous entoure depuis votre iPhone ou tablette Android.

## Vision

Une seule PWA installable sur iPhone et tablette Android qui :
- **Scanne** automatiquement tous les appareils autour de vous (WiFi, Bluetooth, IR).
- **Identifie** chaque appareil via IA (Claude API) + base de connaissances évolutive.
- **Pilote** TV, enceintes, lumières, prises, montres, bracelets, box de streaming, dongles IR.
- **Apprend** à chaque nouvel appareil rencontré et enrichit sa base.
- **Exécute** des macros multi-appareils en un clic ("Tout éteindre", "Soirée ciné", etc.).

## Composants

| Composant | Rôle | Plate-forme |
|-----------|------|-------------|
| **PWA** (`index.html`) | UI universelle, scanner, remote, macros, IA | iPhone Safari + Android Chrome |
| **Bridge** (`bridge/`) | Serveur Node.js sur LAN — scan mDNS/SSDP/BLE, adapters | Termux (tablette Android) ou Raspberry Pi |
| **Raccourcis Apple** (`shortcuts/`) | Intégration HomeKit / AirPlay / Find My depuis iOS | iPhone |

## Quickstart

1. **PWA** : ouvrir `index.html` via GitHub Pages → "Ajouter à l'écran d'accueil".
2. **Bridge** (optionnel mais recommandé) : voir `docs/BRIDGE-SETUP.md`.
3. **Raccourcis** : importer les `.shortcut` du dossier `shortcuts/` via iCloud.

## Limites honnêtes

Cette app **ne peut pas** :
- Éteindre des iPhone/Android non appairés d'autres personnes (verrou OS).
- Scanner hors de votre propre réseau WiFi.
- Contourner les protections d'appareils tiers sans autorisation.

Elle **peut** :
- Piloter tous vos appareils connectés à votre réseau ou appairés.
- Exécuter des scènes "tout off" sur votre écosystème (TV, enceintes, lumières, prises).

## Documentation

- `docs/ANDROID-SETUP.md` — Installer sur tablette Android.
- `docs/IPHONE-SETUP.md` — Installer sur iPhone + Raccourcis.
- `docs/BRIDGE-SETUP.md` — Déployer le bridge Node.js.
- `docs/SECURITE.md` — Token, firewall, bonnes pratiques.
- `docs/IDENTIFICATION.md` — Base de données d'empreintes (généré par agents IA).
- `docs/ADAPTERS.md` — Liste des protocoles/libs supportés (généré par agents IA).
- `docs/IA-IDENTIFICATION.md` — Module IA auto-apprenant (généré par agents IA).
- `docs/IR-SUPPORT.md` — Infrarouge & dongles (généré par agents IA).
- `docs/CLONE.md` — **Clone universel** : NFC, RFID 125k, IR, Sub-GHz, QR, BLE — tes propres tags seulement.
- `docs/AUDIT-HARDWARE.md` — Couverture hardware actuelle vs cible v1.0.
- `docs/AUDIT-OPTIMISATION.md` — Scalabilité, sécurité, fixes appliqués.
- `docs/AUDIT-UX.md` — UX, intuitivité, innovations priorisées.
- `docs/AUDIT-POLYVALENCE.md` — Top 20 extensions à ajouter pour devenir universel.

## Fonctions clés

- 🔍 **Scanner universel** (mDNS + SSDP + BLE + ARP)
- 🤖 **Identification IA** (Claude API + KB locale auto-apprenante)
- 🎛️ **Télécommande virtuelle** pour 12+ marques (TV/enceintes/lumières/prises/IR)
- 🪄 **Macros multi-appareils** ("Tout éteindre", "Soirée ciné", "Panique silence", "Réveil")
- 📇 **Clone multi-format** (NFC NDEF, RFID 125k EM4100/H10301, IR, Sub-GHz 433/868 fixe, QR, Barcode, BLE adv)
- 🎨 **5 thèmes** (Casino doré, Nuit, Jour, Arcade néon, Pro épuré)
- 👶 **Modes contextuels** (Jour, Nuit, Enfant, Invité)
- 🔔 **Raccourcis Apple** pour HomeKit, Find My, AirPlay, lockscreen widget

## Licence

MIT — usage personnel encouragé.

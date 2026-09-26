# Module Clone universel — iRemoteHub

> Copier et rejouer les empreintes sans fil / optiques / infrarouges de **TES PROPRES** cartes, tags et télécommandes.

## ⚠️ Cadre légal — à lire avant usage

### ✅ Autorisé (usage perso, tes objets)
- Dupliquer ta carte de pointage bureau sur un tag NFC vierge ou un Flipper Zero.
- Copier ton badge d'immeuble 125 kHz (EM4100/EM4102) sur un T5577 que tu as acheté.
- Cloner ta télécommande IR de TV/climatiseur/ventilateur.
- Copier l'UID d'une carte de machine à café / cantine / piscine municipale que tu possèdes.
- Apprendre un code 433 MHz de télécommande de portail/volet **fixe** (pre-2010) que tu possèdes.
- Lire/écrire un tag NDEF NFC (URL, contact, WiFi share, action Raccourci).
- Scanner et ré-afficher un QR code ou code-barre.

### ❌ Interdit / refusé par l'app (même si techniquement possible)
- Cartes bancaires EMV (contact ou NFC) → **crime** (L323-1 Code pénal FR, 18 USC 1029 US).
- Cartes d'identité électroniques, permis, passeports biométriques.
- Clés de voiture rolling code (KeeLoq / Hitag 2 / Megamos) → délit LPM / fraude.
- Badges haute sécurité chiffrés (HID iClass SE, MIFARE DESFire EV2+, Seos) sans clés légitimes.
- Défi/réponse cryptographique (clonage actif) sur tout système non à toi.
- Clonage SIM / IMSI catcher.
- Interception de trames sans consentement propriétaire.

### 🛑 Mécanisme anti-abus intégré
- Popup disclaimer à la 1ère utilisation : "Je confirme que l'objet à cloner m'appartient".
- Journal local (non envoyé) des clones effectués + horodatage + hash matériel.
- Refus automatique des formats bloqués (liste noire hardcodée ci-dessous).
- Jamais d'envoi de données cryptographiques clonées vers un serveur tiers.

---

## Formats supportés — matrice

| Format | Fréquence / support | Lecture | Clonage | Hardware requis | Note légale |
|--------|---------------------|---------|---------|------------------|-------------|
| **NFC NDEF** | 13.56 MHz | ✅ PWA Android Chrome (Web NFC) | ✅ tag vierge NTAG21x | Tablette Android avec NFC | 100% OK |
| **MIFARE Classic UID** | 13.56 MHz | ✅ | ⚠️ UID only → carte "magic" requise | Flipper Zero / Chameleon Mini / PN532 | Autorisé si tes cartes |
| **MIFARE Classic full (secteurs)** | 13.56 MHz | 🔒 nécessite clés | 🔒 avec clés | Flipper + attaque MFKey32 | Zone grise — uniquement tes propres cartes avec clés par défaut |
| **MIFARE Ultralight** | 13.56 MHz | ✅ | ✅ | PN532 / Flipper | OK |
| **MIFARE DESFire EV1/EV2** | 13.56 MHz | UID seulement | ❌ (chiffré 3DES/AES) | N/A | Refus app |
| **EM4100 / EM4102** | 125 kHz | ✅ | ✅ sur T5577 / EM4305 | Flipper / Proxmark / Chameleon | OK (badge immeuble perso) |
| **HID Prox (H10301)** | 125 kHz | ✅ | ✅ sur T5577 | Flipper / Proxmark | OK |
| **HID iClass SE** | 13.56 MHz | 🔒 | 🔒 | Proxmark3 RDV4 avec clés | Refus si pas de clés légit |
| **Indala** | 125 kHz | ✅ | ✅ | Flipper / Proxmark | OK |
| **IR (télécommandes)** | 38-56 kHz optique | ✅ | ✅ | BroadLink RM4 / Flipper / mobile IR | OK |
| **Sub-GHz 433 MHz fixe** | 433.92 MHz OOK | ✅ | ✅ | Flipper / RTL-SDR + dongle émission / CC1101 | OK si fixe |
| **Sub-GHz 868 MHz fixe** | 868 MHz | ✅ | ✅ | Flipper / CC1101 | OK si fixe |
| **Rolling code (KeeLoq, Hitag 2)** | sub-GHz | ✅ lecture | ❌ | N/A | Refus |
| **QR code / DataMatrix** | optique | ✅ caméra PWA | ✅ affichage écran | Aucun | OK |
| **Code-barres 1D (EAN/Code128)** | optique | ✅ caméra PWA | ✅ rendu SVG | Aucun | OK |
| **Magstripe** | piste magnétique | ❌ (pas de lecteur téléphone) | ❌ | Lecteur/écrivain MSR605X | Rare, refus app (souvent bancaire) |
| **BLE advertising (avertissement) ** | 2.4 GHz | ✅ | ✅ rejouer advertising | Android avec permissions | OK (trackers perso) |
| **WiFi identifiant (SSID + mot de passe)** | — | ✅ lire tag NFC WiFi | ✅ écrire | NFC | OK (partager ton WiFi) |

---

## Architecture logicielle

```
┌─────────────────────┐
│  PWA (iPhone/Tab)   │
│  • Caméra (QR/BC)   │
│  • Web NFC (NDEF)   │  ◄─── Lecture/écriture directe (Android)
│  • Web BT (BLE adv) │
└──────────┬──────────┘
           │ POST /clone/read, /clone/write
           ▼
┌─────────────────────────────────────────┐
│  Bridge Node.js                          │
│  bridge/adapters/clone.js (dispatcher)   │
│    ├─ nfc.js         (PN532 USB)        │
│    ├─ rfid125k.js    (Proxmark3 USB)    │
│    ├─ ir.js          (BroadLink RM4)    │
│    ├─ subghz.js      (CC1101 / RTL-SDR) │
│    ├─ flipper.js     (Flipper Zero BLE) │
│    ├─ barcode.js     (rendu SVG)        │
│    └─ ble_adv.js     (Noble re-emit)    │
└─────────────────────────────────────────┘
```

## Hardware recommandé (ordonné par polyvalence)

| Hardware | Couvre | Prix | Connexion | Fonction iRemoteHub |
|----------|--------|------|-----------|---------------------|
| **Flipper Zero** | NFC + RFID 125k + IR + Sub-GHz + iButton + RFID HF + Bad USB | ~100 € | BLE / USB | **Pivot central** — app pilote via sa Mobile API |
| **BroadLink RM4 Pro** | IR + RF 433 MHz fixe | ~45 € | WiFi local | Déjà intégré dans `bridge/adapters/broadlink.js` |
| **PN532 module USB/I2C** | NFC 13.56 MHz | ~8 € | USB serial | Lecture/écriture NFC fast |
| **Chameleon Mini / Ultra** | NFC + RFID 125k | ~50-80 € | USB / BLE | Emulation multi-ID |
| **Proxmark3 Easy / RDV4** | NFC + 125 kHz pro | ~70-450 € | USB | Analyse avancée (keys, etc.) |
| **RTL-SDR Blog V3** | Lecture sub-GHz 25-1700 MHz | ~30 € | USB | Démodulation signaux, réception seule |
| **CC1101 dongle USB** | Sub-GHz émission 315/433/868/915 MHz | ~15 € | USB | Émission codes appris |
| **iPhone (NFC background)** | NFC NDEF lecture | — | — | Limité (iOS 14+, arrière-plan) |
| **Tablette Android + NFC** | NFC lecture/écriture complet via Web NFC | — | — | Zéro hardware additionnel nécessaire |

---

## Endpoints bridge (API)

### Lecture
```
POST /clone/read
Body: { type: "nfc" | "rfid125k" | "ir" | "subghz_433" | "subghz_868" | "barcode" | "ble_adv", timeout_ms?: 10000 }
Response: {
  ok: true,
  format: "EM4102",
  raw_hex: "...",
  pronto: "...",   // pour IR
  ndef: [...],     // pour NFC
  id: "0xABCDEF12", // pour badges
  rssi: -42,       // pour BLE
  learned_at: ISO8601
}
```

### Écriture / ré-émission
```
POST /clone/write
Body: { source_id: "<from KB>", target_type: "ntag215" | "t5577" | "ir" | "cc1101", ... }
Response: { ok: true, bytes_written: N, verify_passed: true }
```

### Bibliothèque personnelle
```
GET  /clone/library                   // tes codes clonés
POST /clone/library                   // enregistre + label
DELETE /clone/library/:id             // oublie
GET  /clone/library/:id/export        // export JSON portable
POST /clone/library/import            // restaure
```

## Stockage local

```json
// bridge/data/clone-library.json
{
  "entries": [
    {
      "id": "clone-1",
      "label": "🚪 Porte bureau",
      "format": "EM4102",
      "raw_hex": "0x0F5A3B1C",
      "hardware": "Proxmark3",
      "learned_at": "2026-04-18T09:12:00Z",
      "notes": "Bureau 3e étage"
    },
    {
      "id": "clone-2",
      "label": "☕ Carte machine à café",
      "format": "MIFARE_CLASSIC_UID",
      "uid": "04A3B29812",
      "hardware": "Flipper Zero",
      "learned_at": "2026-04-18T10:30:00Z"
    },
    {
      "id": "clone-3",
      "label": "📺 TV salon",
      "format": "IR_Pronto",
      "pronto": "0000 006D ...",
      "broadlink_b64": "JgCcAQAB...",
      "hardware": "BroadLink RM4",
      "buttons": ["power", "vol+", "vol-", "mute", "input"]
    },
    {
      "id": "clone-4",
      "label": "🚗 Portail maison",
      "format": "OOK_433MHz",
      "carrier_mhz": 433.92,
      "modulation": "ASK",
      "raw_pulses_us": [300, 900, 300, ...],
      "hardware": "Flipper Zero",
      "fixed_code": true,
      "learned_at": "2026-04-18T11:00:00Z"
    }
  ],
  "disclaimer_accepted": true,
  "disclaimer_ts": "2026-04-18T09:00:00Z"
}
```

---

## Flux UX dans la PWA

1. Nav bas → onglet **📇 Clone**.
2. Disclaimer 1re fois : case à cocher « Ces objets m'appartiennent » + bouton « J'accepte ».
3. Écran principal :
   - Bibliothèque personnelle (cards avec emoji + label + format + bouton « Ré-émettre »).
   - Bouton flottant « ➕ Cloner nouvelle ».
4. **Nouveau clone** :
   - Choix format : 🏷️ NFC • 📇 RFID 125k • 📺 IR • 📡 Sub-GHz • 📷 QR/Barcode • 🔵 BLE adv.
   - Instructions guidées par format (ex NFC : « Approcher l'objet du dos du téléphone »).
   - Barre de progression pendant l'apprentissage.
   - Preview + nom + emoji à attribuer.
   - Sauvegarder.
5. **Ré-émission** :
   - Tap la card → bouton « 📤 Envoyer » ou « Afficher QR/Barcode ».
   - Feedback haptique + toast succès.

---

## Apple Shortcuts associés

- **iRemoteHub - Clone NFC → lire** : déclenche lecture NFC iOS native, retourne NDEF.
- **iRemoteHub - Clone NFC → écrire** : prend une entrée de la bibliothèque + écrit sur tag vierge.
- **iRemoteHub - Afficher QR "Café"** : ouvre l'app en plein écran sur un QR.
- **iRemoteHub - Émettre IR TV** : appelle le bridge /clone/write avec BroadLink.

---

## Limites techniques honnêtes

- **iPhone ne peut pas écrire le NFC** depuis une PWA Safari (API absente).  
  → Solution : utiliser l'app **Raccourcis iOS** qui elle, peut écrire du NDEF natif.
- **iPhone ne lit que NDEF en arrière-plan**, pas les UID bruts.  
  → Solution : tablette Android + Web NFC pour les UID bruts.
- **Pas d'émission IR depuis iPhone** (pas de hardware IR).  
  → BroadLink RM4 (ou équivalent WiFi) requis côté bridge.
- **Pas d'émission Sub-GHz depuis tel téléphone** (ni iPhone ni tablette).  
  → Flipper Zero (mobile) ou dongle CC1101/RTL-SDR sur le bridge.
- **Cartes MIFARE Classic avec clés non-défaut** : non supporté par l'app (nécessite clés que l'utilisateur doit fournir manuellement).
- **Codes chiffrés / rolling** : impossible par design (c'est fait pour), l'app **refuse poliment**.

---

## Roadmap

- **v0.2** : NFC NDEF read/write (Web NFC), IR via BroadLink, QR/Barcode, disclaimer UX.
- **v0.3** : Flipper Zero Mobile API (BLE) → RFID 125k + Sub-GHz 433/868.
- **v0.4** : PN532 USB direct, Chameleon Mini, Proxmark3 Easy.
- **v0.5** : RTL-SDR réception + CC1101 émission pour sub-GHz étendu.
- **v1.0** : import/export bibliothèque chiffrée, sharing familial sécurisé.

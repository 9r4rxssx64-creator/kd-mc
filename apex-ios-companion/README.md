# Apex iOS Companion — Capacitor Wrapper

> APEX v13.3.58 (Kevin 2026-05-08) — STRATÉGIE B : App native iOS pour débloquer Bluetooth/NFC/USB sur Safari.

## Pourquoi cette app

iOS Safari (même en PWA) bloque définitivement :
- ❌ Web Bluetooth
- ❌ Web NFC
- ❌ Web USB
- ❌ Web Serial
- ❌ Web HID

Cette app native iOS **wrappe Apex v13** dans une WebView native + plugins Capacitor custom qui exposent **Core Bluetooth**, **Core NFC** et **External Accessory** au JavaScript Apex via bridge `postMessage`.

## Architecture

```
┌────────────────────────────────────┐
│  iPhone (App Store ou TestFlight)  │
├────────────────────────────────────┤
│  Apex iOS Companion (Swift)        │
│  ├─ WKWebView                      │
│  │  └─ Charge apex-ai-v13/index.html│
│  ├─ ApexBluetoothPlugin (Swift)    │
│  ├─ ApexNFCPlugin (Swift)          │
│  └─ ApexUSBPlugin (Swift)          │
│       ↕ Capacitor bridge           │
│  Apex JS appelle window.Capacitor… │
└────────────────────────────────────┘
```

## Status

🟡 **Scaffolding posé** (cette session) — implémentation native à finaliser dans une session ultérieure.

## Roadmap finalisation (next session)

### Phase 1 — Setup Capacitor (1-2h)
- [ ] `npm init` + `@capacitor/core` + `@capacitor/ios`
- [ ] `npx cap init "Apex iOS" io.kdmc.apex.companion`
- [ ] `npx cap add ios`
- [ ] Configurer `capacitor.config.ts` pour pointer vers `apex-ai/v13/dist/`
- [ ] Build Apex web → copy → `npx cap sync ios`

### Phase 2 — Plugin Bluetooth (3-4h)
- [ ] Créer `plugins/apex-bluetooth/`
- [ ] Implémenter Swift CoreBluetooth wrapper
  - [ ] `scanDevices(serviceUUIDs)` → array of {name, uuid, rssi}
  - [ ] `connect(uuid)` → connection handle
  - [ ] `readCharacteristic(handle, charUUID)` → Data
  - [ ] `writeCharacteristic(handle, charUUID, data)`
  - [ ] `subscribeNotifications(handle, charUUID)` → events
- [ ] Permissions iOS : `NSBluetoothAlwaysUsageDescription` dans Info.plist

### Phase 3 — Plugin NFC (2-3h)
- [ ] Créer `plugins/apex-nfc/`
- [ ] Implémenter Swift CoreNFC wrapper
  - [ ] `readTag()` → {type, payload, uri?}
  - [ ] `writeTag(payload)` (NDEF write)
  - [ ] `emulateTag(payload)` (NFC emulation, iOS 15+)
- [ ] Capabilities : Near Field Communication Tag Reading + Writing
- [ ] Entitlements : `com.apple.developer.nfc.readersession.formats`

### Phase 4 — Plugin USB/Serial (External Accessory, 4-5h)
- [ ] Créer `plugins/apex-usb/`
- [ ] Implémenter Swift ExternalAccessory wrapper
  - [ ] `listAccessories()` → array of MFi devices
  - [ ] `openSession(name, protocol)` → session
  - [ ] `read(session)` / `write(session, data)`
- [ ] Note : nécessite MFi accessory (limité aux périphériques certifiés Apple)

### Phase 5 — Distribution (1-2h)
- [ ] Apple Developer account ($99/an Kevin déjà ?)
- [ ] App ID + Provisioning profile
- [ ] App Store Connect → app new
- [ ] TestFlight build pour Kevin (test immédiat)
- [ ] Soumission App Store (review ~3-7 jours)

## Configuration prévue (capacitor.config.ts)

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.kdmc.apex.companion',
  appName: 'Apex',
  webDir: '../apex-ai/v13/dist',
  server: {
    url: 'https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#08080f',
  },
  plugins: {
    ApexBluetooth: { stateRestorationKey: 'apex-bt-restore' },
    ApexNFC: { hint: 'Apex demande accès NFC' },
  },
};

export default config;
```

## API JS exposée à Apex web

Une fois le wrapper installé, Apex peut détecter et utiliser :

```typescript
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
  /* Mode companion : on a accès BT/NFC/USB ! */
  const { ApexBluetooth } = await import('./plugins/apex-bluetooth');
  const devices = await ApexBluetooth.scanDevices({ timeout: 5000 });
}
```

`services/companion-detect.ts` (à créer next session) wrappera ça en helper standard.

## Lien avec autres stratégies

- **Stratégie A (Cloudflare Worker)** : reste utile pour pilotage cloud (Broadlink/eWeLink/Tuya)
- **Stratégie C (Apple Shortcuts)** : reste utile en fallback si user n'a pas installé Companion
- **Stratégie D (Web Share Target)** : déjà actif sur Apex web standard
- **Stratégie E (Pushcut)** : reste utile pour notifications push depuis serveur
- **Stratégie F (WebRTC)** : reste utile pour scan IP partiel sans plugin

Le Companion est **la stratégie la plus puissante** mais demande plus de setup. C'est aussi la base pour commercialiser **e-Apex** sur App Store.

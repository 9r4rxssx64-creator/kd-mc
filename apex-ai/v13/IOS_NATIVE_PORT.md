# Apex v13 — Port natif iOS via Capacitor (Kevin 2026-05-15)

> **Statut** : préparation v13.4.122 — package + config + bridge service livrés. Build iOS nécessite Mac + Xcode (étape Kevin).

## Pourquoi Capacitor

| Option | Délai | Garde le code TS existant ? |
|---|---|---|
| **Capacitor 8** (choisi) | ~1 semaine | ✅ 95% (le bundle web est wrappé WKWebView) |
| Swift natif from scratch | 2-3 mois | ❌ 0% (tout réécrit) |
| React Native | 3-4 semaines | ❌ 50% (UI à réécrire) |

Capacitor = WKWebView qui charge `dist/index.html` localement (offline-first) + accès natif APIs iOS via plugins TypeScript.

## Ce qui est livré v13.4.122

```
apex-ai/v13/
├── package.json              + 14 deps Capacitor (@capacitor/core, ios, preferences, share, push, etc.)
├── capacitor.config.ts       Config app : appId com.kdmc.apex, scheme apex://, App Group group.com.kdmc.apex.vault
└── services/
    └── apex-ios-native.ts    Bridge service : détecte natif vs PWA + Keychain/Filesystem/Share/Push/Device
```

Le bridge `apexIosNative` expose :
- `secureStore/Read/Remove` → iOS Keychain (App Group) si natif, localStorage sinon
- `writeFileToIcloud` → iOS Documents directory (iCloud Drive) si natif, Blob download sinon
- `shareNative` → UIActivityViewController si natif, Web Share API sinon
- `requestPushPermission` → APNs natif si natif, Web Push sinon
- `getDeviceInfo` → modèle iPhone + iOS version + identifier
- `diagnose` → liste plugins disponibles (debug admin)

## Ce qui reste à faire (côté Kevin sur Mac)

### 1. Setup Xcode (~30 min one-shot)

```bash
# Sur ton Mac
brew install cocoapods                 # gestionnaire deps iOS
xcode-select --install                  # outils CLI
```

Ouvrir Xcode au moins une fois, accepter licences, signer compte Apple Developer (99€/an pour publier App Store).

### 2. Init projet iOS depuis Mac

```bash
cd ~/path/to/CMCteams/apex-ai/v13
npm install                             # récupère deps Capacitor
npm run build                           # génère dist/ Vite
npx cap add ios                         # crée dossier ios/ avec projet Xcode
npx cap sync ios                        # copie dist/ → ios/App/public + plugins
npx cap open ios                        # ouvre Xcode sur le projet
```

Xcode s'ouvre avec `ios/App/App.xcworkspace`.

### 3. Config Xcode (~15 min)

Dans Xcode → onglet **Signing & Capabilities** :
- **Team** : sélectionner le compte Apple Developer
- **Bundle Identifier** : `com.kdmc.apex` (déjà dans config)
- **+ Capability** → ajouter :
  - **Keychain Sharing** + App Group `group.com.kdmc.apex.vault` (pour vault persistant cross-install)
  - **Push Notifications** (APNs)
  - **iCloud** → Services CloudKit + Key-Value Storage (sync auto)
  - **Background Modes** → Remote notifications

### 4. Info.plist permissions (déjà préparé dans capacitor.config.ts)

À ajouter dans `ios/App/App/Info.plist` :
```xml
<key>NSCameraUsageDescription</key>
<string>Scanner documents et codes barres</string>
<key>NSMicrophoneUsageDescription</key>
<string>Dictée vocale et wake word "Dis Apex"</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Sauvegarder QR codes backup vault</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Backup QR code dans Photos iCloud</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Géolocalisation pour recommandations contextuelles</string>
<key>NSFaceIDUsageDescription</key>
<string>Déverrouillage rapide du Coffre Apex</string>
```

### 5. Test sur simulateur (5 min)

Dans Xcode :
- Choisir un device simulateur (iPhone 16 Pro recommandé)
- Cmd+R pour build + lancer
- Apex s'ouvre dans le simu, le bridge `apexIosNative.isNative()` retourne `true`

### 6. Test sur iPhone physique (Kevin)

- Connecter iPhone via USB
- Faire confiance à l'ordinateur sur l'iPhone
- Dans Xcode, sélectionner le device iPhone
- Cmd+R pour build + déploiement

Première install : iOS demande de faire confiance au développeur dans **Réglages → Général → Gestion VPN et appareil**.

### 7. Publication TestFlight → App Store (~1-2 jours)

```bash
# Dans Xcode
Product → Archive → Distribute App → App Store Connect → Upload
```

Puis sur https://appstoreconnect.apple.com :
- Créer fiche app "Apex"
- Description, screenshots iPhone (6.7", 6.5", 5.5"), keywords
- TestFlight : invite externe Kevin pour bêta-test
- Submit for Review (Apple : 24-48h délai actuel)

## Architecture runtime

```
┌─────────────────────────────────────────────────┐
│  Apex app (TypeScript bundle Vite, 95% inchangé)│
│  ↓                                              │
│  apexIosNative.isNative() ─ retourne true       │
│  ↓                                              │
│  Capacitor bridge JS                            │
│  ↓                                              │
│  WKWebView ⟷ Plugins Swift natifs               │
│  ├── Preferences  → iOS Keychain (App Group)    │
│  ├── Filesystem   → iCloud Drive Documents      │
│  ├── Share        → UIActivityViewController    │
│  ├── PushNoti     → APNs (Apple Push Service)   │
│  ├── Camera       → AVCaptureSession            │
│  └── Device       → UIDevice + identifierForVendor│
└─────────────────────────────────────────────────┘
```

## Avantages natif vs PWA actuelle

| Capacité | PWA Safari iOS | Apex natif Capacitor |
|---|---|---|
| **Vault persiste reinstall app** | ❌ localStorage perdu | ✅ Keychain App Group |
| **Push notifications** | ⚠️ Web Push limité iOS 16.4+ | ✅ APNs natif fiable |
| **Backup iCloud auto** | ❌ Pas d'accès Drive | ✅ Documents iCloud sync |
| **FaceID/TouchID** | ⚠️ WebAuthn partiel | ✅ LocalAuthentication natif |
| **Photos** | ⚠️ Web Share lecture seule | ✅ PHPhotoLibrary lecture+écriture |
| **Wake word background** | ❌ Safari kill app au lock | ✅ Background audio mode |
| **App Store distribution** | ❌ "Ajouter à l'écran" caché | ✅ Cherche "Apex" App Store |
| **Updates** | ✅ SW auto | ✅ TestFlight + App Store |
| **Offline 100%** | ✅ SW cache | ✅ Bundle local |

## Risques + mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Refus App Store (rules content) | Pas distrib | Pré-soumission via Apple Review Guidelines checklist |
| Bug WKWebView vs Safari real | Régression | Test simu + iPhone physique avant release |
| Push APNs cert mal configuré | Pas de notifs | Test envoi via Apple Push Notification Console |
| Keychain perd données upgrade iOS | Données perdues | App Group bien configuré + backup Firebase quotidien préservé |
| Plugins Capacitor breaking change | Build cassé | Lock versions `~8.3.4` dans package.json |

## Coûts

- **Apple Developer Program** : 99 USD/an (obligatoire pour App Store + push prod)
- **Mac** : nécessaire pour Xcode (location Cloud Mac MacInCloud ≈ 30 USD/mois en alternatif)
- **TestFlight** : gratuit
- **App Store distribution** : gratuit après Developer Program

## Prochaines étapes (mes côtés)

1. ✅ Capacitor installé + config (v13.4.122)
2. ✅ Bridge service `apexIosNative` (v13.4.122)
3. ⏳ Wirer apex-ios-native dans vault.ts (Keychain priorité pour PAT GitHub + secrets)
4. ⏳ Wirer dans apex-qr-backup.ts (Photos save direct au lieu de Web Share)
5. ⏳ Wirer dans push.ts (APNs au lieu de Web Push si natif)
6. ⏳ Tests vitest pour le bridge (mock window.Capacitor)
7. ⏳ Sentinelle `ios-native-watch` : si natif, vérifier plugins OK au boot

À chaque ajout : préservation totale du fallback PWA (Apex doit marcher web + iOS natif sans modification user).

## Test mental obligatoire avant chaque release iOS

> *"Si Kevin installe Apex via TestFlight sur iPhone vierge, est-ce qu'il (1) reçoit notif push test, (2) son vault survit suppression-réinstall app, (3) backup auto vers iCloud Drive marche, (4) FaceID déverrouille Coffre, (5) wake word "Dis Apex" marche app fermée ?"*

Si une réponse non → fixer avant release App Store.

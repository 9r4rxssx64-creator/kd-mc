# Roadmap app native CMCteams (option C — vrai 24/7)

> **Statut : exploratoire.** Cette doc décrit ce qu'il faudrait pour passer la géoloc de **"continu pendant app ouverte"** (limite PWA actuelle v9.214-219) à **"continu 24/7 même app fermée"**.

---

## 📱 Limites fondamentales du web/PWA

Même avec Wake Lock + keep-alive audio (v9.218-219), le tracking s'arrête quand :
- L'utilisateur quitte l'app (swipe up)
- L'écran se verrouille et le téléphone reste inactif plusieurs minutes
- iOS en mode "Focus" coupe le JavaScript en background
- Android kill les processus en low-memory

**Seul un binaire natif** avec permission système "localisation en arrière-plan" peut continuer à tracker même si l'utilisateur quitte l'app ou verrouille le téléphone.

---

## 🛠 Stack technique recommandée

### Option 1 — React Native (cross-platform iOS + Android)
- **Librairies** : `react-native-background-geolocation` (Motorway) ou `@mauron85/react-native-background-geolocation`
- **Délai** : ~2 mois dev initial + 2 semaines QA
- **Coût licence** : ~500-800€ (BG Geolocation)
- **Avantage** : 1 codebase pour iOS + Android

### Option 2 — Flutter
- **Plugin** : `flutter_background_geolocation`
- **Code** : Dart

### Option 3 — Swift (iOS) + Kotlin (Android) natif
- **Délai** : 3-4 mois (deux codebases)

---

## 🏗 Architecture proposée (RECOMMANDÉE)

App native avec **WebView fullscreen qui charge directement le `index.html` existant** (hébergé GitHub Pages).

- Le code natif se limite à : tracker le GPS en background + injecter les positions dans la webview via `postMessage`
- La webview reste alimentée par `savePositionForUid()` existant
- **Zéro refactor du code CMCteams** — tout est réutilisé tel quel

---

## 🔑 Permissions

### iOS (Info.plist)
```xml
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>CMC Teams utilise votre position pour organiser les tables, rotations et breaks en temps réel au Casino de Monte-Carlo.</string>
<key>UIBackgroundModes</key>
<array><string>location</string></array>
```

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

---

## 📋 Phases de livraison

| Phase | Durée | Livrable |
|-------|-------|----------|
| 1 — POC iOS | 3 sem | RN + BG geolocation + WebView |
| 2 — Android | 2 sem | Port + permissions background |
| 3 — Stores | 2 sem | App Store + Play Store review |
| 4 — Production | - | TestFlight/Internal Testing + déploiement SBM |

---

## 💰 Budget estimé

| Poste | Coût |
|-------|------|
| Dev freelance RN senior | 12-18k€ |
| Licence BG Geolocation | 500-800€ |
| Apple Dev Program Enterprise | 299 $/an |
| Google Play Dev | 25 $ one-time |
| **Total one-shot** | **~15-20k€** |

---

## ⚖️ Considérations légales (CRITIQUE)

Le tracking 24/7 d'employés est encadré par la CNIL/Monaco :

1. **Consultation CSE/IRP** avant déploiement
2. **Déclaration CCIN Monaco**
3. **Durée conservation limitée** (90 jours max recommandé)
4. **Accès restreint** : admin RH avec journal d'accès
5. **Finalité précise** : "organisation salle" pas "surveillance"
6. **Consentement éclairé** : avenant contrat de travail
7. **Droit d'opposition** : alternative non-discriminatoire

**Recommandation** : avocat droit du travail monégasque avant dev.

---

## ✅ Ce qui est DÉJÀ en place (v9.214-219) réutilisable

- ✓ Modal consentement CGU
- ✓ Storage `cmc_positions` + sync Firebase
- ✓ Throttle 30s + rolling 48h
- ✓ Flag `onShift:true/false`
- ✓ Révocation consentement
- ✓ Admin map `vGeoAdmin` avec iframe OSM
- ✓ Wake Lock API (v9.218)
- ✓ Keep-alive audio silencieux (v9.219)

**→ Tout ça sera réutilisé tel quel dans la webview de l'app native.**

---

## 🚀 Décision Kevin

- **Si vraiment 24/7 strict** : démarrer projet natif (2-3 mois, ~15-20k€)
- **Sinon** : v9.214-219 actuelle couvre 80% (tracking tant que l'app est ouverte + Wake Lock + keep-alive audio pour prolonger background)

---

*Créé : 2026-04-17 · v9.219 — enrichir quand Kevin valide la suite*

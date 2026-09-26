<!--
APEX v13 — Audit fonctions v12 oubliées (Kevin "il manquait la géolocalisation, toutes ces options et fonctions que je t'avais demandées").

Source : /home/user/CMCteams/_archive_v12/apex-v12-index.html (37640 lignes, 149 fonctions vXxx, 1001 fonctions axXxx).
Comparaison avec : /home/user/CMCteams/apex-ai/v13/features/*/index.ts (27 features actuelles).
Date audit : 2026-05-07.
Auteur : subagent géolocalisation.
-->

# Audit v12 → v13 — Fonctions oubliées (top 30+)

Inventaire des fonctions de vue v12 (`vXxx`) **présentes en v12 mais absentes ou très partielles en v13**, classées par criticité Kevin/business.

## ✅ DÉJÀ AJOUTÉES dans cette mission (subagent)

| Feature v12 | Status v13 | Service | Fichier |
|---|---|---|---|
| `vGeolocation` | ✅ Ajouté | `services/geolocation.ts` (24 méthodes) | `features/geo/index.ts` |
| `vSecuritePerso` (partage GPS) | ✅ Couvert via geo | `geolocation.share` | inline view |

## 🔴 P0 — À PORTER EN PRIORITÉ ABSOLUE (impact business direct Kevin)

| # | Feature v12 | Description | Estimation |
|---|---|---|---|
| 1 | `vCalculatorsHub` | Hub 10+ calculatrices pro (IBAN, IMC, IR France 2026, plus-value immo, crédit immo, conversions) | Présent partiel `features/calculators/` — manque routing hub global |
| 2 | `vConverter` | Convertisseur unités universel (longueur, poids, volume, surface, température) | Inclus dans calculators mais sans vue dédiée |
| 3 | `vCryptoPortfolio` | Tracker portefeuille crypto + courbes valuation BTC/ETH | Présent partiel `features/crypto/` — manque API CoinGecko + graph |
| 4 | `vBilan` | Dashboard financial 360° (revenus, dépenses, KPI annuel) | Service `financial-dashboard.ts` existe mais pas de feature/view |
| 5 | `vBookmarks` | Favoris web persistants per-user + tags + recherche | Absent v13 |
| 6 | `vDiary` | Journal intime chiffré (vault) avec markdown + recherche full-text | Absent v13 |
| 7 | `vTokenBalance` | Solde tokens IA (Anthropic/OpenAI/Groq) avec alertes recharge | Service `tokens-dashboard.ts` existe — pas de view |
| 8 | `vPlantStudio` | Jardin lunaire avec phases lune Conway + biodynamie | Absent v13 |
| 9 | `vGeoStudio` | Studio cartes/itinéraires Leaflet avec POIs + tracés GPX | Couvert partiellement via nouvelle feature/geo (extension future) |
| 10 | `vPetStudio` | Carnet santé animaux domestiques (vaccins, vermifuges) | Absent v13 |

## 🟠 P1 — À PORTER ENSUITE (UX/admin essentiel)

| # | Feature v12 | Description | Estimation |
|---|---|---|---|
| 11 | `vBuildingStudio` | Calculs construction RE2020 + DTU + mélange béton/peinture | Absent v13 |
| 12 | `vGardenLunarStudio` | Calendrier biodynamique lune montante/descendante + semis | Absent v13 |
| 13 | `vScanStudio` | Scanner OCR multi-format (Tesseract.js) + QR + barcode | Absent v13 — service `vision.ts` existe mais pas de view |
| 14 | `vCameraStudio` | Caméra plein écran avec capture + filters + Web Audio | Absent v13 |
| 15 | `vBroadlinkRemote` | Télécommande IR universelle (TVs, climatiseurs) via Cloudflare Worker | Absent v13 — service `device-control.ts` existe |
| 16 | `vDeviceCapabilities` | Audit capabilities device (BLE, NFC, USB, Permissions API) | Absent v13 — service `capabilities.ts` existe partiel |
| 17 | `vIosHacks` | Raccourcis iOS Shortcuts + Apple Wallet pass generator | Absent v13 |
| 18 | `vSmartDiscovery` | Découverte appareils LAN via mDNS + WebRTC | Absent v13 — service `network-scan.ts` existe partiel |
| 19 | `vMapAdmin` | Carte admin avec live positions users + heatmap | Absent v13 |
| 20 | `vQRGenerator` | Générateur QR codes avec custom colors + logo | Absent v13 |

## 🟡 P2 — À PORTER POUR COMPLÉTUDE (monitoring/admin avancé)

| # | Feature v12 | Description | Estimation |
|---|---|---|---|
| 21 | `vSentinelsHealth` | Dashboard santé sentinelles avec last-run + score | Service `sentinels.ts` + `sentinels-registry.ts` existe |
| 22 | `vErrorsLive` | Live tail des erreurs window.onerror + unhandledrejection | Absent v13 |
| 23 | `vClickFailures` | Boutons cliqués sans réaction (UX failure tracking) | Absent v13 |
| 24 | `vMemoryDashboard` | Dashboard usage localStorage + IDB + quota warning | Absent v13 — `storage-compressor.ts` existe |
| 25 | `vPersistenceAudit` | Audit persistance keys critiques + restore Firebase | Absent v13 |
| 26 | `vUXAutoFix` | Auto-fix UX issues détectés (low contrast, small targets) | Absent v13 |
| 27 | `vTraces` | Distributed tracing chaque requête API avec request_id | Absent v13 |
| 28 | `vCalendarSync` | Sync calendrier OS (CalDAV iCloud + Google Calendar) | Absent v13 |
| 29 | `vBackgroundAssistant` | Assistant background (focus mode, Pomodoro, méditation) | Absent v13 |
| 30 | `vUserPersonalization` | Personnalisation poussée (typo, layout, animations off) | Absent v13 |

## 🟢 P3 — Intégration future (low priority)

| # | Feature v12 | Description |
|---|---|---|
| 31 | `vHabits` | Tracker habitudes quotidiennes + streaks |
| 32 | `vGoals` | Objectifs SMART avec milestones + progress |
| 33 | `vTasks` | Todo list avec priorités + tags + due dates |
| 34 | `vShopping` | Liste courses partagée famille avec catégories |
| 35 | `vExpenses` | Tracker dépenses avec catégorisation auto |
| 36 | `vContacts` | Carnet contacts avec sync vCard import/export |

## Statistiques globales audit

- Total fonctions vXxx en v12 : **149**
- Total features actuelles v13 : **27** (+ studios sub-modules + pro modules)
- **Estimation gap** : ~80 vues v12 absentes ou très partielles en v13.
- Fonctions axXxx (services) en v12 : **1001**
- Services v13 actuels : **~95**
- **Gap services** : ~200-300 helpers utilitaires v12 non encore portés (auto-detect credentials, sentinelles spécialisées, etc.)

## Recommandations

1. **Sprint immédiat** : compléter P0 #4 vBilan, #5 vBookmarks, #7 vTokenBalance (services existent, manque que la vue).
2. **Sprint suivant** : P0 #6 vDiary + P1 #14 vCameraStudio (capabilities device disponibles).
3. **Continu** : porter 2-3 features/semaine en commençant par P0 puis P1.
4. **Pattern** : pour chaque vue portée → service backend (si pas existant) + tests ≥85% + intégration tools IA + injection memory.ts system prompt + i18n keys.

---

Cet audit doit être relu à chaque sprint pour cocher les ports faits et ajuster les priorités selon Kevin.

# CLAUDE.md — iRemoteHub

Guide pour assistants IA travaillant sur ce projet.

---

## 🛡️ Protocole anti-timeout

Voir `~/.claude/CLAUDE.md` pour les règles globales. Rappels clés :
- Toute commande > 30s → `run_in_background: true`.
- Paralléliser au maximum (multi tool calls par message).
- Subagents `Explore` pour recherches lourdes.
- Relancer automatiquement après timeout sans redemander.

---

## Vue d'ensemble

**iRemoteHub** est une PWA monofichier + un bridge Node.js optionnel pour piloter tous les appareils électroniques autour de l'utilisateur.

- **Langue** : Français (UI, doc, commits).
- **Version actuelle** : `APP_VER = "v0.1"`.
- **Architecture** : PWA (index.html) ↔ Bridge (Node.js sur Termux Android) ↔ Appareils LAN/BLE/IR.
- **Déploiement** : GitHub Pages pour la PWA, Termux pour le bridge.

---

## Structure

```
iRemoteHub/
├── index.html                # PWA monofichier (UI + logique + IA)
├── manifest.webmanifest      # PWA installable
├── sw.js                     # Service worker offline
├── icons/                    # 192/512/maskable
├── bridge/
│   ├── package.json
│   ├── server.js             # Express + WS, point d'entrée
│   ├── discovery/            # mdns, ssdp, ble, arp
│   ├── adapters/             # sonos, roku, hue, bravia, webos, tizen, tplink, broadlink, wol, ...
│   ├── ia/                   # Module IA : identify, learn, kb
│   ├── macros.js             # Exécution parallèle macros
│   └── auth.js               # Token pairing
├── shortcuts/                # Raccourcis Apple (import iCloud)
└── docs/                     # Docs setup + bases de connaissances
```

---

## Principes de conception

1. **Local-first** : aucune donnée utilisateur n'atterrit sur un serveur externe sans consentement explicite.
2. **IA optionnelle** : l'app marche sans clé Claude API (fallback KB locale + WebSearch gratuit).
3. **Honnêteté** : jamais promettre un contrôle impossible. Afficher clairement les limites OS.
4. **Polyvalence** : supporter le max de marques/protocoles via adapters modulaires.
5. **Apprentissage** : chaque identification réussie enrichit la KB locale (+ partage anonyme optionnel).

---

## Sécurité

- Token d'auth entre PWA et bridge (partage QR code au premier appairage).
- Aucune commande destructrice sans confirmation utilisateur.
- Pas de scan hors réseau local de l'utilisateur.
- Respecter les limites légales : pas de tentative de piratage d'appareils tiers.

---

## APIs / libs clés

Voir `docs/ADAPTERS.md` pour la liste complète. Principales :

| Protocole | Lib npm |
|-----------|---------|
| mDNS | bonjour-service |
| SSDP | node-ssdp |
| BLE | @abandonware/noble |
| Sonos | sonos / @svrooij/sonos |
| Roku | roku-client |
| Hue | node-hue-api |
| Bravia | bravia-auth-and-remote |
| WebOS | lgtv2 |
| Samsung | samsung-tv-control |
| BroadLink IR | broadlinkjs-rm |
| HomeKit | hap-controller |
| Matter | @project-chip/matter.js |

---

## Module IA d'identification

Voir `docs/IA-IDENTIFICATION.md` pour l'architecture complète. Résumé :

1. Scanner détecte un appareil → construit un **fingerprint JSON**.
2. Cherche dans **KB locale** (cache IndexedDB + fichier JSON embarqué).
3. Si hit confidence ≥ 0.8 → renvoie direct.
4. Sinon → appelle **Claude API** avec tool use (search_web, fetch_docs, probe_device).
5. L'IA renvoie : vendor, model, protocol, endpoints, libs recommandées.
6. Cache le résultat + demande confirmation utilisateur si < 0.95.
7. Feedback utilisateur → persiste dans KB.

---

## Module Clone multi-format (v0.2)

Voir `docs/CLONE.md` pour détails complets.

```
bridge/adapters/clone.js   — dispatcher + anti-abuse (BLOCKED_FORMATS)
bridge/data/clone-library.json — bibliothèque perso (disclaimer_accepted)
```

**Formats autorisés** : NFC NDEF, MIFARE UID/Ultralight, EM4100/H10301, IR Pronto/BroadLink, Sub-GHz fixe 433/868, QR, Barcode, BLE adv.

**Formats REFUSÉS hardcodés** (liste noire dans `clone.js`) : EMV, HID iClass SE sans clés, MIFARE DESFire, KeeLoq/Hitag2/Megamos (rolling voiture), SIM, passeports, ID eIDAS, magstripe bancaire.

**Disclaimer** : l'utilisateur doit accepter via `POST /clone/disclaimer` avant toute lecture/écriture.

**Endpoints** :
- `GET /clone/disclaimer` / `POST /clone/disclaimer`
- `POST /clone/read` / `POST /clone/write`
- `GET|POST|DELETE /clone/library[/:id]`
- `GET /clone/blocked-formats`

---

## Macros multi-appareils

```javascript
// Exemple schema
{
  "id": "all-off",
  "name": "Tout éteindre",
  "icon": "🌙",
  "steps": [
    { "device_id": "*", "category": "tv", "action": "power_off" },
    { "device_id": "*", "category": "speaker", "action": "stop" },
    { "device_id": "*", "category": "light", "action": "off" },
    { "device_id": "*", "category": "plug", "action": "off" }
  ],
  "parallel": true,
  "timeout_ms": 5000
}
```

---

## Workflow Git

- **Branche principale** : `main` (pas de push direct).
- **Branche feature courante** : `claude/iphone-device-remote-control-Nam26`.
- Messages de commit : `vX.Y: description`.
- Jamais de `--no-verify` ni `--force` sans demande explicite.

---

## 🏛️ Architecture APEX AI (intégration)

**iRemoteHub doit fonctionner dans DEUX modes :**

### 1. Standalone (autonome)
- PWA déployée sur GitHub Pages → URL publique.
- Fonctionne seule sans APEX.
- LocalStorage isolé sous le préfixe `iremotehub_*`.
- Bridge Node.js totalement indépendant.

### 2. Embedded dans APEX AI (orchestrateur)
- APEX monte iRemoteHub dans une iframe OU l'importe comme module.
- Communication PWA ↔ APEX via `postMessage` avec origine whitelistée.
- Même namespace `iremotehub_*` en localStorage — APEX peut lire/écrire pour sync multi-apps.
- APEX expose une API : `iRemoteHub.launch()`, `iRemoteHub.getDevices()`, `iRemoteHub.runMacro(name)`, `iRemoteHub.on(event, cb)`.
- APEX peut modifier le code à chaud (hot reload) et le pousser dans ses sous-apps.

### Contrat d'intégration

```javascript
// iRemoteHub expose un objet global
window.iRemoteHub = {
  version: APP_VER,
  mode: window.parent !== window ? 'embedded' : 'standalone',

  // Lifecycle
  init(config) { ... },           // reçoit {bridge_url, token, theme, lang} depuis APEX
  destroy() { ... },               // cleanup avant unmount

  // Actions publiques
  getDevices() { return A.devices; },
  runMacro(name) { return api.post(`/macro/${name}`); },
  scanNow() { return api.post('/scan'); },
  identifyDevice(id) { ... },

  // Events → APEX écoute via iRemoteHub.on('device:update', cb)
  on(event, cb) { ... },
  off(event, cb) { ... }
};

// Si embedded : communique avec APEX via postMessage
if (window.iRemoteHub.mode === 'embedded') {
  window.addEventListener('message', handleApexCommand);
  window.parent.postMessage({ from: 'iremotehub', type: 'ready', version: APP_VER }, '*');
}
```

### Sous-apps APEX

APEX AI orchestre (au moins) :
- **iRemoteHub** (ce projet) — télécommande universelle multi-appareils.
- **Crackpass** — inactif (voir autre repo).
- **CMCteams** — planning casino (parent repo).

Chaque sous-app DOIT :
- Exposer un manifest `{name, version, entry, permissions[], events[]}`.
- Respecter le namespace localStorage.
- Accepter thème + langue depuis APEX (prop override).
- Logger via `console` préfixé `[iRemoteHub]` pour triage dans APEX.

### Intégration APEX (workflow)

1. L'utilisateur dit "je termine iRemoteHub" → on fige v0.1.
2. On copie le dossier `iRemoteHub/` dans le repo APEX (ou `git subtree`/`submodule`).
3. APEX ajoute `iRemoteHub` à sa liste de sous-apps.
4. APEX expose un bouton "Lancer iRemoteHub" qui monte la PWA en iframe.
5. Depuis APEX : clic "Modifier iRemoteHub" → ouvre éditeur → push MAJ → PWA recharge à chaud.

---

1. ❌ Écrire dans `index.html` sans checker la taille (éviter > 600 KB).
2. ❌ Laisser des clés API en clair dans le code.
3. ❌ Faire un scan réseau sans demander confirmation utilisateur (vie privée).
4. ❌ Appeler Claude API sans cache → coût explosif.
5. ❌ Promettre l'extinction d'appareils non-appairés (impossible OS).
6. ❌ Oublier `esc()` HTML sur données externes.
7. ❌ Utiliser synchronous fetch dans le SW (cassé).

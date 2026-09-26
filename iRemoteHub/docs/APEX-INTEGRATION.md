# Intégration APEX AI

> Comment iRemoteHub s'intègre comme sous-app d'APEX tout en restant utilisable seul.

## Vue d'ensemble

APEX AI est l'orchestrateur central. Chaque sous-app (iRemoteHub, Crackpass, CMCteams, …) :
- **A sa vie propre** — repo/URL/PWA autonomes.
- **S'embarque dans APEX** — en iframe ou module JS.
- **Reste synchrone** — état partagé via postMessage + localStorage commun.

```
                          ┌────────────────────┐
                          │     APEX AI        │
                          │  (orchestrateur)   │
                          │                    │
                          │  ┌──────────────┐  │
                          │  │ iRemoteHub   │  │◄── iframe + postMessage
                          │  ├──────────────┤  │
                          │  │ Crackpass    │  │
                          │  ├──────────────┤  │
                          │  │ CMCteams     │  │
                          │  └──────────────┘  │
                          │                    │
                          │  Monitoring • Logs │
                          │  Thème • Langue    │
                          │  Hot reload        │
                          └────────────────────┘
```

## Modes

### Standalone
```
https://<user>.github.io/iRemoteHub/
```
- Fonctionne sans APEX.
- LocalStorage préfixé `iremotehub_*`.

### Embedded
```html
<!-- dans APEX -->
<iframe src="https://<user>.github.io/iRemoteHub/?embedded=1&theme=casino&lang=fr"
        id="iremotehub"
        allow="bluetooth; nfc; camera; microphone"
        sandbox="allow-scripts allow-same-origin"></iframe>
```

## API exposée

```javascript
// Global window.iRemoteHub disponible dans les 2 modes
{
  version: "v0.1",
  mode: "embedded" | "standalone",

  // Lecture état
  getDevices(),
  getMacros(),
  getTheme(),
  getCloneLibrary(),

  // Actions
  init(config),       // { bridge_url, token, theme, lang, user_id }
  runMacro(name),
  scanNow(),
  identifyDevice(device_id),
  setTheme(name),
  setMode(mode),       // jour/nuit/enfant/invité

  // Events
  on(event, callback),
  off(event, callback),
  destroy()
}
```

## Events émis vers APEX

```javascript
// APEX écoute :
window.addEventListener('message', (e) => {
  if (e.data.from !== 'iremotehub') return;
  switch (e.data.type) {
    case 'ready':            // PWA montée + prête
    case 'device:found':     // Nouvel appareil détecté
    case 'device:lost':      // Appareil hors-ligne
    case 'macro:executed':   // Macro lancée
    case 'macro:done':       // Macro terminée
    case 'clone:saved':      // Clone ajouté bibliothèque
    case 'error':            // Erreur remontée
    case 'log':              // Log pour APEX monitoring
  }
});
```

## Commandes depuis APEX

```javascript
// APEX envoie :
iframe.contentWindow.postMessage({
  from: 'apex',
  type: 'command',
  command: 'runMacro',
  args: ['all-off']
}, 'https://<user>.github.io');
```

Commands supportées : `runMacro`, `scanNow`, `setTheme`, `setMode`, `getDevices`, `identifyDevice`, `reload`, `setBridge`.

## Hot reload

APEX peut déclencher un rechargement :
```javascript
iframe.contentWindow.postMessage({
  from: 'apex',
  type: 'command',
  command: 'reload'
}, origin);
```

La PWA appelle `location.reload()` sauf si une action est en cours (protection).

## LocalStorage partagé

Clés iRemoteHub (préfixe obligatoire) :
- `iremotehub_bridge_url`
- `iremotehub_bridge_token`
- `iremotehub_theme`
- `iremotehub_mode`
- `iremotehub_macros_custom`
- `iremotehub_devices_cache`

APEX peut lire/écrire ces clés pour sync cross-app (ex: thème global APEX → tous les sous-apps).

## Manifest sous-app (pour APEX)

```json
{
  "name": "iRemoteHub",
  "slug": "iremotehub",
  "version": "0.1.0",
  "icon": "🎛️",
  "entry": "https://<user>.github.io/iRemoteHub/",
  "standalone_url": "https://<user>.github.io/iRemoteHub/",
  "embedded_url": "https://<user>.github.io/iRemoteHub/?embedded=1",
  "permissions": ["bluetooth","nfc","camera","microphone","network"],
  "events_emitted": ["ready","device:found","device:lost","macro:executed","clone:saved","error"],
  "commands_accepted": ["runMacro","scanNow","setTheme","setMode","getDevices","identifyDevice","reload","setBridge"],
  "bridge_required": false,
  "bridge_url_placeholder": "http://192.168.x.x:7070"
}
```

## Workflow "modification depuis APEX"

1. Utilisateur dans APEX : clic **"Modifier iRemoteHub"**.
2. APEX ouvre un éditeur de code (Monaco) sur le `index.html` de iRemoteHub.
3. L'utilisateur édite (ou demande à l'IA d'APEX d'éditer).
4. APEX push sur la branche Git + déploie via GitHub Pages.
5. PWA iRemoteHub (ouverte dans iframe) reçoit `command: reload`.
6. Recharge à chaud, nouvelle version active.

## Sécurité

- L'iframe est sandboxée : `sandbox="allow-scripts allow-same-origin"`.
- L'origine du `postMessage` est vérifiée côté iRemoteHub (whitelist : origine APEX).
- Le bridge n'accepte que des tokens valides (même depuis APEX).
- Aucune donnée sensible ne transite par APEX sans chiffrement.

## Quand intégrer

> "QUAND LE PROJET SERA TERMINÉ" — instruction utilisateur.

Définition de "terminé" pour v0.1 :
- [x] Bridge Node.js complet avec 12 adapters + module IA + clone.
- [x] Docs complètes (10 fichiers `.md`).
- [x] Audits experts 4 agents intégrés.
- [ ] PWA `index.html` fonctionnelle (scanner + macros + clone + modes).
- [ ] Test end-to-end (bridge démarre, PWA ouvre, commande OK).
- [ ] Apple Shortcuts importables (`.shortcut` binaries à créer).
- [ ] Déploiement GitHub Pages OK.

Une fois ces 4 points cochés → intégration APEX.

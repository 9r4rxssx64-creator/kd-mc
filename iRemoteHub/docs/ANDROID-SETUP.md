# Android — Setup tablette

Optimal pour iRemoteHub (Chrome débloque Web Bluetooth, Web USB, Web NFC + peut héberger le bridge via Termux).

## 1. Installer la PWA

1. Ouvrir Chrome sur la tablette.
2. Aller sur l'URL GitHub Pages de iRemoteHub.
3. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
4. L'icône apparaît comme une app native, lancement plein écran.

## 2. Activer Web Bluetooth

Chrome ≥ 56 : activé par défaut. Si problème :
- `chrome://flags/#enable-experimental-web-platform-features` → **Enabled**.
- Redémarrer Chrome.

## 3. Activer Web NFC (Android Chrome 89+)

- `chrome://flags/#enable-webnfc` → **Enabled**.
- Approcher un tag NFC d'un appareil pour appairage rapide.

## 4. Installer le bridge Node.js via Termux

```bash
# Termux (F-Droid, pas Play Store — Play = obsolète)
pkg update && pkg upgrade
pkg install nodejs-lts git
termux-setup-storage

# Autoriser l'accès Bluetooth & réseau local dans Termux:API (optionnel)
pkg install termux-api

# Cloner & installer
git clone <repo-url> iRemoteHub
cd iRemoteHub/bridge
npm install
node server.js
```

Le bridge écoute sur `http://<ip-tablette>:7070`.

## 5. Laisser le bridge tourner en tâche de fond

Utiliser `termux-wake-lock` + démarrage auto via widget Termux :

```bash
termux-wake-lock
node server.js &
```

## 6. Appairer la PWA au bridge

Dans la PWA → **Paramètres → Bridge** → entrer `http://<ip-tablette>:7070` + scanner le QR de token affiché par le bridge.

## 7. Cas particulier : tablette avec blaster IR intégré

Certaines Xiaomi / Samsung anciennes ont une diode IR :
```bash
# Test (si root / API disponible)
termux-infrared-frequencies
termux-infrared-transmit -f 38000 <pattern>
```

Sinon, utiliser un dongle BroadLink RM4 Mini (WiFi, aucun besoin de root).

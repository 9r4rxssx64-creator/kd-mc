# Bridge — Setup

Le bridge Node.js scanne le LAN profondément et expose une API HTTP/WebSocket que la PWA appelle. Indispensable pour débloquer l'iPhone (qui ne peut pas scanner en Bluetooth ou faire du UDP multicast).

## Options de déploiement

| Hôte | Avantages | Inconvénients |
|------|-----------|---------------|
| **Tablette Android + Termux** | Pas de matériel en plus, WiFi + BLE natif | Consommation batterie |
| **Raspberry Pi Zero 2W** | Toujours allumé, discret | Achat matériel ~20€ |
| **NAS Synology / PC maison** | Puissant, toujours en ligne | Encombrant, complexe |

## Termux (recommandé sans matériel)

```bash
# 1. Installer Termux depuis F-Droid (pas Play Store)
# https://f-droid.org/packages/com.termux/

# 2. Setup
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git openssh
termux-setup-storage

# 3. Récupérer le projet
cd ~
git clone https://github.com/<user>/iRemoteHub
cd iRemoteHub/bridge

# 4. Installer les dépendances
npm install --no-optional   # sans BLE natif (compilation lourde)
# OU avec BLE (nécessite compilation, ~5 min)
npm install

# 5. Démarrer
node server.js
```

## Configuration

Fichier `bridge/config.json` (auto-créé au premier lancement) :

```json
{
  "port": 7070,
  "auth_token": "<généré-auto>",
  "scan_interval_ms": 60000,
  "enable_ble": false,
  "enable_ir": true,
  "broadlink_devices": [],
  "anthropic_api_key": "",
  "anthropic_model": "claude-haiku-4-5-20251001"
}
```

## Démarrage auto (Termux)

```bash
# Wake lock pour éviter l'endormissement
termux-wake-lock

# Boot script
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-iremotehub <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/iRemoteHub/bridge
node server.js >> ~/iremotehub.log 2>&1 &
EOF
chmod +x ~/.termux/boot/start-iremotehub
```

Puis installer **Termux:Boot** (F-Droid) → démarre automatiquement au reboot.

## Vérification

```bash
curl http://127.0.0.1:7070/health
# → {"status":"ok","uptime":42,"devices_known":0}

curl http://127.0.0.1:7070/devices
# → []
```

## Appairage PWA

1. Dans la PWA : **Paramètres → Bridge → Appairer**.
2. Saisir `http://<ip-locale>:7070`.
3. Scanner le QR code affiché dans le terminal Termux (contient le token d'auth).
4. La PWA stocke token + URL dans IndexedDB.

## Raspberry Pi (alternative)

```bash
# Sur Pi OS Lite
sudo apt install -y nodejs npm git
git clone https://github.com/<user>/iRemoteHub
cd iRemoteHub/bridge
npm install
sudo npm install -g pm2
pm2 start server.js --name iremotehub
pm2 save
pm2 startup
```

## Mise à jour

```bash
cd ~/iRemoteHub
git pull
cd bridge && npm install
# Puis redémarrer (ctrl-c + node server.js, ou pm2 restart)
```

## Logs

```bash
tail -f ~/iremotehub.log
# OU
pm2 logs iremotehub
```

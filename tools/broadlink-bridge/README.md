# Apex Broadlink HTTP Bridge

Bridge HTTP autonome qui pilote les appareils **Broadlink RM Mini / RM Pro / RM4 / RM4 Pro** depuis Apex (browser).

Le browser Apex ne peut pas faire UDP direct (limitation Web). Ce bridge tourne sur ton réseau (Raspberry Pi, NAS, ordi, Docker, Home Assistant) et expose les commandes IR en HTTP.

---

## Installation

### Option A — Install one-liner (Linux/Mac/Raspberry Pi)

```bash
curl -sSL https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/tools/broadlink-bridge/install.sh | bash
```

Le script :
- Installe Python 3 si absent
- Crée un venv dans `~/apex-broadlink-bridge/`
- Installe `broadlink + flask + flask-cors`
- Configure systemd service (auto-start boot Linux)
- Détecte ton IP locale + affiche l'URL pour Apex

### Option B — Docker

```bash
cd tools/broadlink-bridge
docker build -t apex-broadlink-bridge .
docker run -d --net=host --restart=unless-stopped \
  --name apex-bridge \
  -v $(pwd)/codes.json:/app/codes.json \
  apex-broadlink-bridge
```

`--net=host` est requis pour que le bridge puisse faire UDP discovery du Broadlink sur ton réseau local.

### Option C — Manuel Python

```bash
pip install broadlink flask flask-cors
python3 bridge.py
```

Variables environnement :
- `PORT` (default `8780`)
- `HOST` (default `0.0.0.0`)
- `CODES_FILE` (default `./codes.json`)
- `DEVICE_IP` (optionnel, sinon auto-discovery)

### Option D — Home Assistant addon

Voir [home-assistant-addon/](home-assistant-addon/) (à créer si demandé).

---

## Utilisation depuis Apex

1. Bridge démarré sur `http://192.168.1.100:8780` (ton IP locale)
2. Sur iPhone, ouvre Apex → Plus → "Telecommande" → tape "🔍 Auto-découverte réseau"
3. Apex scanne `192.168.0/1/2.x:8780` → trouve ton bridge → configure auto `ax_ir_url`
4. Tu peux maintenant utiliser tous les boutons TV/Clim/Lumière

---

## Endpoints HTTP

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/` | Status + marker pour auto-detection Apex |
| GET | `/health` | Healthcheck simple |
| GET | `/device` | Info device Broadlink connecté |
| POST | `/discover` | Rescan réseau (10s timeout) |
| GET | `/send/<command>` | Envoie code IR pré-enregistré |
| POST | `/send` | Envoie code IR brut hex (`{hex: "..."}`) |
| GET | `/learn/<name>` | Active mode apprentissage (30s timeout) |
| GET | `/codes` | Liste tous les codes appris (JSON) |
| DELETE | `/code/<name>` | Supprime un code |

---

## Apprentissage codes IR

```bash
# Mode apprentissage (30s)
curl http://192.168.1.100:8780/learn/tv_power_clayton

# Pointe ta télécommande Clayton vers le Broadlink
# Appuie sur la touche que tu veux apprendre dans les 30s

# Vérifier
curl http://192.168.1.100:8780/codes

# Tester le code appris
curl http://192.168.1.100:8780/send/tv_power_clayton
```

---

## Codes IR pré-installés (codes.json)

Le fichier `codes.json` est créé automatiquement et contient tes codes appris. Format :

```json
{
  "tv_power_clayton": {
    "hex": "26009000...",
    "name": "tv_power_clayton",
    "category": "tv",
    "learned_at": 1714572800
  }
}
```

Tu peux pré-remplir avec des codes IR connus depuis [IRDB](https://irdb.tk/) ou [LIRC](https://lirc.sourceforge.net/remotes/) si tu connais le hex Broadlink.

---

## Compatibilité Broadlink

Testé avec :
- ✅ Broadlink RM Mini 3 (RM3)
- ✅ Broadlink RM Pro / RM Pro+
- ✅ Broadlink RM4 Mini
- ✅ Broadlink RM4 Pro
- ⚠️ Broadlink RM4C Mini (firmware récent only)

Setup initial du device : utilise l'app **Broadlink officielle** sur ton iPhone une fois pour configurer le Wi-Fi du device, puis tu peux utiliser ce bridge.

---

## Sécurité

- Le bridge écoute sur `0.0.0.0` par défaut (toutes interfaces)
- **Pas d'authentification** — utilise uniquement sur ton réseau local privé
- Si exposé Internet : ajoute un reverse proxy avec auth (nginx/Caddy + Basic Auth)
- CORS ouvert (`*`) car Apex est servi depuis github.io

Pour restreindre :
```python
# bridge.py - remplacer
CORS(app, resources={r"/*": {"origins": "*"}})
# par
CORS(app, resources={r"/*": {"origins": "https://9r4rxssx64-creator.github.io"}})
```

---

## Troubleshooting

**Le bridge démarre mais aucun device trouvé :**
```bash
# Vérifie que le Broadlink est sur le même subnet
ping 192.168.1.X  # IP de ton Broadlink (visible app Broadlink)

# Force discovery par IP
curl -X POST "http://localhost:8780/discover?ip=192.168.1.42"
```

**Apex auto-découverte ne trouve rien :**
- Le bridge tourne-t-il ? `curl http://localhost:8780/`
- Subnet correct ? Ton iPhone et le bridge doivent être sur le même réseau Wi-Fi
- Firewall ouvert sur port 8780 ?
- Apex Coffre > `ax_ir_url` peut être configuré manuellement

**Erreur "Device authentication failed" :**
- Reset le Broadlink (15s sur reset button) + reconfigure dans app Broadlink officielle
- Puis relance le bridge

---

## Service systemd (Linux/Raspberry Pi)

Si installé via `install.sh`, le service est déjà actif :

```bash
# Status
sudo systemctl status apex-broadlink

# Logs en direct
journalctl -u apex-broadlink -f

# Restart
sudo systemctl restart apex-broadlink

# Stop
sudo systemctl stop apex-broadlink
```

---

## Roadmap

- [ ] Auth optionnelle (token via header)
- [ ] Support multiple devices (plusieurs Broadlink)
- [ ] Bibliothèque codes IRDB intégrée (Clayton/Samsung/LG/Sony)
- [ ] Webhook events (vers Apex via push)
- [ ] Home Assistant addon natif
- [ ] Web UI minimale en standalone (sans Apex)

PR/issues bienvenus.

#!/usr/bin/env python3
"""
Apex Broadlink HTTP Bridge — v1.0
==================================

Bridge HTTP autonome qui pilote les appareils Broadlink (RM Mini/RM Pro/RM4/RM4 Pro).
Le browser Apex ne peut pas faire UDP direct (CORS) -> ce bridge expose les
commandes en HTTP pour qu'Apex puisse les utiliser sur le reseau local.

INSTALLATION RAPIDE :

# Option A : pip + Python 3.7+
pip install broadlink flask
python3 bridge.py

# Option B : Docker
docker build -t apex-broadlink-bridge .
docker run -d --net=host --name apex-bridge apex-broadlink-bridge

# Option C : systemd service (Raspberry Pi)
sudo cp apex-broadlink.service /etc/systemd/system/
sudo systemctl enable --now apex-broadlink

ENDPOINTS :
  GET  /              -> status (auto-detection Apex)
  GET  /device         -> info appareil decouvert
  POST /discover       -> rescan reseau (10s)
  GET  /send/<command> -> envoie commande IR pre-enregistree
  POST /send           -> envoie code IR brut hex (body: {hex})
  GET  /learn/<name>   -> active mode apprentissage 30s
  GET  /codes          -> liste codes appris (JSON)
  DELETE /code/<name>  -> supprime un code

Variables environnement :
  PORT (default 8780)
  HOST (default 0.0.0.0)
  CODES_FILE (default ./codes.json)
  DEVICE_IP (optionnel, sinon auto-discovery)
"""
import os
import json
import time
import threading
import binascii
import sys
import socket

try:
    import broadlink
except ImportError:
    print("ERREUR : pip install broadlink", file=sys.stderr)
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("ERREUR : pip install flask flask-cors", file=sys.stderr)
    sys.exit(1)


PORT = int(os.environ.get("PORT", 8780))
HOST = os.environ.get("HOST", "0.0.0.0")
CODES_FILE = os.environ.get("CODES_FILE", "./codes.json")
DEVICE_IP = os.environ.get("DEVICE_IP", "")
DISCOVERY_TIMEOUT = int(os.environ.get("DISCOVERY_TIMEOUT", 10))


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

device = None
device_lock = threading.Lock()
codes = {}


def load_codes():
    global codes
    if os.path.exists(CODES_FILE):
        try:
            with open(CODES_FILE, "r") as f:
                codes = json.load(f)
        except Exception as e:
            print(f"WARN load codes: {e}", file=sys.stderr)
            codes = {}
    return codes


def save_codes():
    try:
        with open(CODES_FILE, "w") as f:
            json.dump(codes, f, indent=2)
    except Exception as e:
        print(f"ERREUR save codes: {e}", file=sys.stderr)


def discover_device(target_ip=None, timeout=10):
    """Discover Broadlink on local network. Returns device or None."""
    global device
    print(f"[discover] timeout={timeout}s target={target_ip or 'auto'}", flush=True)
    try:
        if target_ip:
            # Connection directe par IP
            for cls in [broadlink.rm4pro, broadlink.rm4mini, broadlink.rmpro, broadlink.rmmini]:
                try:
                    dev = cls((target_ip, 80), bytes(6), 0)
                    dev.auth()
                    device = dev
                    print(f"[discover] OK direct {target_ip}", flush=True)
                    return dev
                except Exception:
                    continue
        # Auto-discovery broadcast UDP
        devs = broadlink.discover(timeout=timeout)
        if devs:
            device = devs[0]
            try:
                device.auth()
                print(f"[discover] OK auto {device.host}", flush=True)
                return device
            except Exception as e:
                print(f"[discover] auth fail: {e}", flush=True)
    except Exception as e:
        print(f"[discover] error: {e}", flush=True)
    return None


def get_local_ip():
    """Best-effort local IP detection."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "0.0.0.0"


@app.route("/")
def root():
    """Apex auto-detection marker."""
    return jsonify({
        "service": "apex-broadlink-bridge",
        "version": "1.0",
        "device_connected": device is not None,
        "device_host": device.host[0] if device else None,
        "codes_count": len(codes),
        "local_ip": get_local_ip(),
        "endpoints": ["/device", "/discover", "/send/<cmd>", "/learn/<name>", "/codes"]
    })


@app.route("/device")
def device_info():
    if not device:
        return jsonify({"connected": False, "msg": "Aucun device. POST /discover pour scanner."}), 404
    return jsonify({
        "connected": True,
        "host": device.host[0],
        "mac": ":".join(f"{b:02x}" for b in device.mac),
        "type": device.type,
        "model": device.model,
        "manufacturer": device.manufacturer
    })


@app.route("/discover", methods=["POST", "GET"])
def discover_endpoint():
    target_ip = request.args.get("ip") or DEVICE_IP
    timeout = int(request.args.get("timeout", DISCOVERY_TIMEOUT))
    with device_lock:
        dev = discover_device(target_ip, timeout)
    if dev:
        return jsonify({
            "ok": True,
            "host": dev.host[0],
            "mac": ":".join(f"{b:02x}" for b in dev.mac),
            "type": dev.type,
            "model": dev.model
        })
    return jsonify({"ok": False, "msg": "Aucun Broadlink trouve. Verifie qu'il est sur le meme reseau et alimente."}), 404


@app.route("/send/<command>")
def send_command(command):
    """Envoie un code IR pre-enregistre."""
    if not device:
        return jsonify({"ok": False, "msg": "Device non connecte. POST /discover d'abord."}), 503
    if command not in codes:
        return jsonify({"ok": False, "msg": f"Code '{command}' inconnu. Apprends-le via /learn/{command}"}), 404
    try:
        hex_code = codes[command]["hex"]
        device.send_data(binascii.unhexlify(hex_code))
        return jsonify({"ok": True, "command": command, "name": codes[command].get("name", command)})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500


@app.route("/send", methods=["POST"])
def send_raw():
    """Envoie un code IR brut hex (body JSON: {hex: '...'})."""
    if not device:
        return jsonify({"ok": False, "msg": "Device non connecte"}), 503
    data = request.get_json(silent=True) or {}
    hex_code = data.get("hex", "")
    if not hex_code:
        return jsonify({"ok": False, "msg": "hex manquant"}), 400
    try:
        device.send_data(binascii.unhexlify(hex_code))
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500


@app.route("/learn/<name>")
def learn(name):
    """Apprend un nouveau code IR (30s timeout)."""
    if not device:
        return jsonify({"ok": False, "msg": "Device non connecte"}), 503
    try:
        print(f"[learn] {name} - waiting for IR signal...", flush=True)
        device.enter_learning()
        start = time.time()
        while time.time() - start < 30:
            try:
                data = device.check_data()
                if data:
                    hex_code = binascii.hexlify(data).decode()
                    codes[name] = {
                        "hex": hex_code,
                        "name": name,
                        "learned_at": int(time.time()),
                        "category": request.args.get("cat", "custom")
                    }
                    save_codes()
                    print(f"[learn] OK {name}: {hex_code[:40]}...", flush=True)
                    return jsonify({"ok": True, "name": name, "hex_preview": hex_code[:60]})
            except Exception:
                time.sleep(0.5)
        return jsonify({"ok": False, "msg": "Timeout 30s. Aucun signal IR detecte."}), 408
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 500


@app.route("/codes")
def list_codes():
    return jsonify(codes)


@app.route("/code/<name>", methods=["DELETE"])
def delete_code(name):
    if name in codes:
        del codes[name]
        save_codes()
        return jsonify({"ok": True})
    return jsonify({"ok": False, "msg": "Inconnu"}), 404


@app.route("/health")
def health():
    """Healthcheck pour monitoring."""
    return jsonify({
        "ok": True,
        "device": device is not None,
        "codes": len(codes),
        "uptime_s": int(time.time() - START_TIME)
    })


# === Boot ===
START_TIME = time.time()


def boot():
    print("=" * 60)
    print(f"Apex Broadlink HTTP Bridge v1.0")
    print(f"Listening on http://{HOST}:{PORT}")
    print(f"Local IP : http://{get_local_ip()}:{PORT}")
    print(f"Codes file : {CODES_FILE}")
    print("=" * 60)
    load_codes()
    print(f"[boot] {len(codes)} codes charges")
    if DEVICE_IP:
        with device_lock:
            discover_device(DEVICE_IP, 5)
    else:
        # Auto-discover at boot in background (non blocking)
        def _bg():
            with device_lock:
                discover_device(None, DISCOVERY_TIMEOUT)
        threading.Thread(target=_bg, daemon=True).start()


if __name__ == "__main__":
    boot()
    app.run(host=HOST, port=PORT, threaded=True, debug=False)

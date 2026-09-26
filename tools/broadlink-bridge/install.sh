#!/usr/bin/env bash
# Apex Broadlink Bridge — Install one-liner pour Raspberry Pi / Linux / macOS
# Usage : curl -sSL https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/tools/broadlink-bridge/install.sh | bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/apex-broadlink-bridge}"
PORT="${PORT:-8780}"
SERVICE_NAME="apex-broadlink"

echo "================================================="
echo "  Apex Broadlink Bridge - Installation"
echo "================================================="
echo "Install dir : $INSTALL_DIR"
echo "Port        : $PORT"
echo

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macos"
else
  echo "OS non supporte : $OSTYPE"
  exit 1
fi
echo "OS detecte : $OS"

# Check Python 3.7+
if ! command -v python3 &> /dev/null; then
  echo "Python3 manquant. Installation..."
  if [[ "$OS" == "linux" ]]; then
    sudo apt update && sudo apt install -y python3 python3-pip python3-venv
  else
    brew install python3
  fi
fi

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Python : $PY_VERSION"

# Setup install dir
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download bridge.py + requirements.txt
BASE_URL="https://raw.githubusercontent.com/9r4rxssx64-creator/cmcteams/main/tools/broadlink-bridge"
echo "Telechargement bridge.py..."
curl -fsSL "$BASE_URL/bridge.py" -o bridge.py
curl -fsSL "$BASE_URL/requirements.txt" -o requirements.txt

# Setup venv
if [ ! -d "venv" ]; then
  echo "Creation venv Python..."
  python3 -m venv venv
fi

# Install deps
echo "Installation dependances (broadlink, flask, flask-cors)..."
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip --quiet
"$INSTALL_DIR/venv/bin/pip" install -r requirements.txt --quiet

# Test que les modules s'importent
"$INSTALL_DIR/venv/bin/python" -c "import broadlink, flask, flask_cors; print('OK imports')"

# Service systemd (Linux only)
if [[ "$OS" == "linux" ]] && command -v systemctl &> /dev/null; then
  echo
  read -p "Installer comme service systemd (auto-demarrage au boot) ? [O/n] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Apex Broadlink HTTP Bridge
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
Environment="PORT=$PORT"
Environment="HOST=0.0.0.0"
Environment="CODES_FILE=$INSTALL_DIR/codes.json"
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/bridge.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl start "$SERVICE_NAME"
    echo "Service installe + demarre. Status :"
    sudo systemctl status "$SERVICE_NAME" --no-pager | head -8
    echo
    echo "Logs : journalctl -u $SERVICE_NAME -f"
  fi
else
  echo
  echo "Pour demarrer manuellement :"
  echo "  cd $INSTALL_DIR && ./venv/bin/python bridge.py"
fi

# Detect local IP
LOCAL_IP=$(python3 -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()" 2>/dev/null || echo "127.0.0.1")

echo
echo "================================================="
echo "  Installation TERMINEE"
echo "================================================="
echo
echo "URL bridge : http://$LOCAL_IP:$PORT"
echo
echo "Test : curl http://$LOCAL_IP:$PORT/"
echo
echo "Dans Apex iPhone :"
echo "  1. Coffre > champ 'ax_ir_url' = http://$LOCAL_IP:$PORT"
echo "  2. OU : Plus > Telecommande > Auto-decouverte"
echo
echo "Apprentissage code IR :"
echo "  curl http://$LOCAL_IP:$PORT/learn/tv_power_clayton"
echo "  Pointe ta telecommande vers le Broadlink + appuie touche dans 30s"
echo

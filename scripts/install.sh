#!/bin/bash
# ChadJaew2 Telescope Camera System - Installation Script

set -e

echo "======================================"
echo "ChadJaew2 Telescope Camera Installer"
echo "======================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./install.sh)"
  exit 1
fi

PROJECT_DIR="/root/ChadJaew2"

echo ""
echo "[1/5] Updating system packages..."
apt update

echo ""
echo "[2/5] Installing dependencies..."
apt install -y ffmpeg hostapd dnsmasq v4l-utils

echo ""
echo "[3/5] Installing MediaMTX..."
if [ ! -f /usr/local/bin/mediamtx ]; then
  cd /tmp
  curl -L -o mediamtx.tar.gz https://github.com/bluenviron/mediamtx/releases/download/v1.15.6/mediamtx_v1.15.6_linux_arm64.tar.gz
  tar xzf mediamtx.tar.gz
  mv mediamtx /usr/local/bin/
  chmod +x /usr/local/bin/mediamtx
  rm -f mediamtx.tar.gz mediamtx.yml LICENSE
  echo "MediaMTX installed: $(mediamtx --version)"
else
  echo "MediaMTX already installed: $(mediamtx --version)"
fi

echo ""
echo "[4/5] Installing Node.js dependencies..."
cd "$PROJECT_DIR"
npm install --production

echo ""
echo "[5/5] Setting up WiFi Access Point..."
"$PROJECT_DIR/scripts/setup-ap.sh"

echo ""
echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "To start the system manually:"
echo "  cd $PROJECT_DIR && node server.js"
echo ""
echo "To enable auto-start on boot:"
echo "  sudo cp $PROJECT_DIR/telescope-camera.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable telescope-camera"
echo "  sudo systemctl start telescope-camera"
echo ""
echo "Connect to WiFi 'ChadJaew2' (password: stargazer)"
echo "Open browser to http://192.168.4.1:3000"
echo ""

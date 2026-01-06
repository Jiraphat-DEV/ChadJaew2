#!/bin/bash
# ChadJaew2 - WiFi Access Point Setup Script

set -e

SSID="ChadJaew2"
PASSWORD="stargazer"
IP_ADDRESS="192.168.4.1"

echo "Setting up WiFi Access Point..."
echo "  SSID: $SSID"
echo "  Password: $PASSWORD"
echo "  IP: $IP_ADDRESS"

# Check if NetworkManager is available
if command -v nmcli &> /dev/null; then
  echo ""
  echo "Using NetworkManager for AP configuration..."

  # Delete existing connection if present
  nmcli con delete "$SSID-AP" 2>/dev/null || true

  # Create new AP connection
  nmcli con add \
    con-name "$SSID-AP" \
    ifname wlan0 \
    type wifi \
    ssid "$SSID"

  # Configure AP mode
  nmcli con modify "$SSID-AP" wifi.mode ap
  nmcli con modify "$SSID-AP" wifi.band bg

  # Security
  nmcli con modify "$SSID-AP" wifi-sec.key-mgmt wpa-psk
  nmcli con modify "$SSID-AP" wifi-sec.psk "$PASSWORD"

  # IP configuration
  nmcli con modify "$SSID-AP" ipv4.method shared
  nmcli con modify "$SSID-AP" ipv4.addresses "$IP_ADDRESS/24"

  # Auto-connect
  nmcli con modify "$SSID-AP" connection.autoconnect yes
  nmcli con modify "$SSID-AP" connection.autoconnect-priority 100

  echo ""
  echo "Access Point configured successfully!"
  echo ""
  echo "To activate now: sudo nmcli con up $SSID-AP"
  echo "To check status: nmcli con show $SSID-AP"

else
  echo ""
  echo "NetworkManager not found. Using hostapd + dnsmasq..."

  # Configure hostapd
  cat > /etc/hostapd/hostapd.conf << EOF
interface=wlan0
driver=nl80211
ssid=$SSID
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$PASSWORD
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

  # Point to config file
  echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

  # Configure dnsmasq
  cat > /etc/dnsmasq.d/telescope-ap.conf << EOF
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
address=/telescope.local/$IP_ADDRESS
EOF

  # Configure static IP for wlan0
  cat >> /etc/dhcpcd.conf << EOF

# Telescope Camera AP
interface wlan0
static ip_address=$IP_ADDRESS/24
nohook wpa_supplicant
EOF

  # Enable services
  systemctl unmask hostapd
  systemctl enable hostapd
  systemctl enable dnsmasq

  echo ""
  echo "Access Point configured with hostapd + dnsmasq"
  echo "Reboot required to activate: sudo reboot"
fi

echo ""

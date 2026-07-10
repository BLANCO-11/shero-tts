#!/bin/bash

# Ensure the script is run with sudo or has root privileges
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script with sudo or as root:"
  echo "  sudo ./install_systemd.sh"
  exit 1
fi

echo "==================================================="
echo "       SHERO-TTS SYSTEMD SERVICE INSTALLER         "
echo "==================================================="

# Stop any running daemons to avoid port binds
echo "⚙ Stopping active shell daemons..."
./stop_service.sh > /dev/null 2>&1

# Copy unit files
echo "⚙ Copying systemd service files to /etc/systemd/system/..."
cp shero-tts-backend.service /etc/systemd/system/
cp shero-tts-frontend.service /etc/systemd/system/

# Reload systemd
echo "⚙ Reloading systemd daemon..."
systemctl daemon-reload

# Enable services
echo "⚙ Enabling services on boot..."
systemctl enable shero-tts-backend.service
systemctl enable shero-tts-frontend.service

# Start services
echo "⚙ Starting service components..."
systemctl start shero-tts-backend.service
systemctl start shero-tts-frontend.service

echo "==================================================="
echo "  SHERO-TTS Systemd Services installed successfully! "
echo "   - Backend Status:  systemctl status shero-tts-backend"
echo "   - Frontend Status: systemctl status shero-tts-frontend"
echo "   - Check Logs:      journalctl -u shero-tts-backend -f"
echo "==================================================="

#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
SERVICE_NAME="${SERVICE_NAME:-track-anime-vk-bot}"
UNIT_SRC="${APP_DIR}/scripts/track-anime-vk-bot.service"
UNIT_DST="/etc/systemd/system/${SERVICE_NAME}.service"

if [ ! -f "$UNIT_SRC" ]; then
  echo "[vk-bot] unit file not found: $UNIT_SRC" >&2
  exit 1
fi

sed "s|/var/www/ta_new|${APP_DIR}|g" "$UNIT_SRC" > "$UNIT_DST"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "[vk-bot] service active: $SERVICE_NAME"
else
  echo "[vk-bot] WARNING: $SERVICE_NAME is not active" >&2
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager || true
  exit 1
fi

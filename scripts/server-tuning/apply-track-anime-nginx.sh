#!/bin/bash
# Переключить track-anime.dygdyg.ru / track-anime.duckdns.org на Next.js (порт 3001).
# Бекап: /etc/nginx/nginx.conf.bak.<timestamp>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW_CONF="${SCRIPT_DIR}/nginx.conf"
TARGET="/etc/nginx/nginx.conf"
BACKUP="${TARGET}.bak.$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$NEW_CONF" ]]; then
  echo "Missing $NEW_CONF" >&2
  exit 1
fi

cp "$TARGET" "$BACKUP"
echo "Backup: $BACKUP"

cp "$NEW_CONF" "$TARGET"
nginx -t
systemctl reload nginx
echo "nginx: track-anime domains → Next.js :3001"

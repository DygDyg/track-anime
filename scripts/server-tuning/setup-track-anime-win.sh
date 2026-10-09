#!/bin/bash
# Expand track-anime.win LE cert (apex + www + mirror + 777) and ensure nginx server_name.
# Does NOT touch server.dygdyg.ru certificate.
set -euo pipefail

certbot certonly --nginx \
  -d track-anime.win -d www.track-anime.win -d mirror.track-anime.win -d 777.track-anime.win \
  --cert-name track-anime.win \
  --non-interactive --agree-tos --expand

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "${SCRIPT_DIR}/apply-track-anime-nginx.sh" ]]; then
  bash "${SCRIPT_DIR}/apply-track-anime-nginx.sh"
else
  nginx -t
  systemctl reload nginx
fi

echo "=== certs ==="
certbot certificates
echo "=== https ==="
curl -sI --max-time 15 https://track-anime.win/ | head -8
curl -sI --max-time 15 https://www.track-anime.win/ | head -8
curl -sI --max-time 15 https://mirror.track-anime.win/ | head -8
curl -sI --max-time 15 https://777.track-anime.win/ | head -8

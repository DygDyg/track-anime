#!/bin/bash
# Применить nginx.conf + track-anime-proxy.conf на сервер.
# Бекап: /etc/nginx/nginx.conf.bak.<timestamp>
# Если сертификат track-anime.win ещё не выпущен — HTTPS-блок для него временно вырезается.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_CONF="${SCRIPT_DIR}/nginx.conf"
PROXY_SNIPPET="${SCRIPT_DIR}/track-anime-proxy.conf"
TARGET="/etc/nginx/nginx.conf"
SNIPPET_TARGET="/etc/nginx/snippets/track-anime-proxy.conf"
BACKUP="${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
TMP_CONF="$(mktemp)"
trap 'rm -f "$TMP_CONF"' EXIT

if [[ ! -f "$SRC_CONF" ]]; then
  echo "Missing $SRC_CONF" >&2
  exit 1
fi
if [[ ! -f "$PROXY_SNIPPET" ]]; then
  echo "Missing $PROXY_SNIPPET" >&2
  exit 1
fi

if [[ -f /etc/letsencrypt/live/track-anime.win/fullchain.pem ]]; then
  cp "$SRC_CONF" "$TMP_CONF"
else
  echo "WARN: track-anime.win cert missing — applying without its 443 server block" >&2
  python3 - "$SRC_CONF" "$TMP_CONF" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
marker = "server {\n\t\tlisten 443 ssl;\n\t\tserver_name track-anime.win;"
start = text.find(marker)
if start < 0:
    open(dst, "w", encoding="utf-8").write(text)
    raise SystemExit(0)
i = start + len("server {")
depth = 1
while i < len(text) and depth:
    ch = text[i]
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
    i += 1
while i < len(text) and text[i] in "\r\n":
    i += 1
open(dst, "w", encoding="utf-8").write(text[:start] + text[i:])
PY
fi

cp "$TARGET" "$BACKUP"
echo "Backup: $BACKUP"

install -d /etc/nginx/snippets
cp "$PROXY_SNIPPET" "$SNIPPET_TARGET"
cp "$TMP_CONF" "$TARGET"
nginx -t
systemctl reload nginx
echo "nginx: track-anime domains → Next.js :3001"

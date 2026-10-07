#!/bin/bash
# One-shot: auth hosts + www SAN on track-anime.win cert + nginx www + reload.
# Does NOT touch server.dygdyg.ru certificate.
set -euo pipefail

python3 - <<'PY'
from pathlib import Path
p = Path("/var/www/ta_new/src/lib/auth/config.ts")
text = p.read_text(encoding="utf-8")
if "track-anime.win" in text and '"track-anime.win"' in text.split("DEFAULT_ALLOWED_ORIGIN_HOSTS", 1)[-1][:400]:
    print("auth already has track-anime.win")
else:
    old = '''const DEFAULT_ALLOWED_ORIGIN_HOSTS = [
  "ta.dygdyg.ru",
  "track-anime.dygdyg.ru",
  "track-anime.duckdns.org",
] as const;'''
    new = '''const DEFAULT_ALLOWED_ORIGIN_HOSTS = [
  "track-anime.win",
  "ta.dygdyg.ru",
  "track-anime.dygdyg.ru",
  "track-anime.duckdns.org",
] as const;'''
    if old not in text:
        raise SystemExit("auth hosts block not found")
    p.write_text(text.replace(old, new), encoding="utf-8")
    print("patched auth config.ts")
PY

ENV=/var/www/ta_new/.env
WANT='AUTH_ALLOWED_ORIGINS=https://track-anime.win,https://ta.dygdyg.ru,https://track-anime.dygdyg.ru,https://track-anime.duckdns.org'
if grep -q '^AUTH_ALLOWED_ORIGINS=' "$ENV"; then
  if grep -q 'track-anime.win' "$ENV"; then
    echo "AUTH_ALLOWED_ORIGINS already has win"
  else
    sed -i "s|^AUTH_ALLOWED_ORIGINS=.*|$WANT|" "$ENV"
    echo "updated AUTH_ALLOWED_ORIGINS"
  fi
else
  printf '\n%s\n' "$WANT" >> "$ENV"
  echo "appended AUTH_ALLOWED_ORIGINS"
fi

certbot certonly --nginx \
  -d track-anime.win -d www.track-anime.win \
  --cert-name track-anime.win \
  --non-interactive --agree-tos --expand

python3 - <<'PY'
from pathlib import Path
for path in [
    Path("/etc/nginx/nginx.conf"),
    Path("/var/www/ta_new/scripts/server-tuning/nginx.conf"),
]:
    text = path.read_text(encoding="utf-8")
    text2 = text.replace(
        "server_name track-anime.win ta.dygdyg.ru track-anime.dygdyg.ru track-anime.duckdns.org;",
        "server_name track-anime.win www.track-anime.win ta.dygdyg.ru track-anime.dygdyg.ru track-anime.duckdns.org;",
    )
    text2 = text2.replace(
        "\tserver_name track-anime.win;\n\t\tssl_certificate /etc/letsencrypt/live/track-anime.win/",
        "\tserver_name track-anime.win www.track-anime.win;\n\t\tssl_certificate /etc/letsencrypt/live/track-anime.win/",
    )
    if text2 != text:
        path.write_text(text2, encoding="utf-8")
        print(f"updated {path}")
    else:
        print(f"no change {path}")
PY

nginx -t
systemctl reload nginx

if systemctl is-active --quiet track-anime; then
  systemctl restart track-anime
  echo "restarted track-anime"
fi

echo "=== certs ==="
certbot certificates
echo "=== https ==="
curl -sI --max-time 15 https://track-anime.win/ | head -8
curl -sI --max-time 15 https://www.track-anime.win/ | head -8
curl -sI --max-time 15 https://track-anime.dygdyg.ru/ | head -5

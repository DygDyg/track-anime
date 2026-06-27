#!/bin/bash
# Серверная часть деплоя. Запускается на production после upload tar.
# Не запускайте вручную без архива в /tmp/ta_deploy.tar.gz — используйте scripts/deploy.ps1.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
SITE_URL="${SITE_URL:-https://ta.dygdyg.ru/}"
SERVICE_NAME="${SERVICE_NAME:-track-anime}"

cd "$APP_DIR"

# CRLF из Windows ломает bash (set: pipefail\r)
for f in scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f"
done

echo "[deploy] extract..."
tar -xzf /tmp/ta_deploy.tar.gz
rm -f /tmp/ta_deploy.tar.gz

# Удаляем устаревшие файлы, которые tar не перезаписывает при удалении из репозитория
rm -f server.ts
rm -rf src/components/watch-party src/lib/watch-party src/app/api/watch-party
rm -f src/server/watch-party-ws.ts src/lib/kodik-player-control.ts
rm -f scripts/ws-create-test.mjs scripts/test-ws.mjs scripts/fix-nginx-ws.sh

echo "[deploy] npm ci..."
npm ci

echo "[deploy] prisma..."
npx prisma generate
npx prisma db push --skip-generate --accept-data-loss

BUILD_FILE="$APP_DIR/.build-number"
BUILD_NUM=$(($(cat "$BUILD_FILE" 2>/dev/null || echo 0) + 1))
echo "$BUILD_NUM" > "$BUILD_FILE"
export BUILD_NUMBER="$BUILD_NUM"
echo "[deploy] build number: $BUILD_NUM"

bash scripts/setup-cover-cache.sh

echo "[deploy] next build..."
rm -rf .next
npm run build

chown -R www-data:www-data "$APP_DIR/.next"

echo "[deploy] restart $SERVICE_NAME..."
systemctl restart "$SERVICE_NAME"
sleep 3

bash scripts/install-kodik-sync-cron.sh

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "[deploy] ERROR: $SERVICE_NAME is not active" >&2
  systemctl status "$SERVICE_NAME" --no-pager || true
  exit 1
fi

HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL")
echo "[deploy] site: $HTTP_CODE ($SITE_URL)"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[deploy] ERROR: expected HTTP 200" >&2
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
  exit 1
fi

echo "[deploy] success (build #$BUILD_NUM)"

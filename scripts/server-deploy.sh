#!/bin/bash
# Серверная часть деплоя. Запускается на production после upload tar.
# Не запускайте вручную без архива в /tmp/ta_deploy.tar.gz — используйте scripts/deploy.ps1.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
SITE_URL="${SITE_URL:-https://track-anime.dygdyg.ru/}"
SERVICE_NAME="${SERVICE_NAME:-track-anime}"
WATCH_PARTY_SERVICE_NAME="${WATCH_PARTY_SERVICE_NAME:-track-anime-watch-party}"
NPM_CI_TIMEOUT="${NPM_CI_TIMEOUT:-10m}"
DEPLOY_PROGRESS_TOTAL=10

deploy_progress() {
  local step="$1"
  local label="$2"
  echo "[deploy:progress] ${step}/${DEPLOY_PROGRESS_TOTAL} ${label}"
  echo "[deploy] ${label}..."
}

run_with_heartbeat() {
  local label="$1"
  local interval_sec="$2"
  shift 2

  "$@" &
  local pid=$!
  local elapsed=0

  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ $((elapsed % interval_sec)) -eq 0 ] && kill -0 "$pid" 2>/dev/null; then
      echo "[deploy] ${label} still running (${elapsed}s)"
    fi
  done

  set +e
  wait "$pid"
  local status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    echo "[deploy] ${label} done (${elapsed}s)"
  else
    echo "[deploy] ERROR: ${label} failed after ${elapsed}s (exit ${status})" >&2
  fi

  return "$status"
}

cd "$APP_DIR"

deploy_progress 1 "extract"
tar -xzf /tmp/ta_deploy.tar.gz
rm -f /tmp/ta_deploy.tar.gz

# CRLF из Windows ломает bash (set: pipefail\r) — после extract, иначе tar перезапишет файлы
for f in scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f"
done

# Удаляем устаревшие файлы, которые tar не перезаписывает при удалении из репозитория
rm -f server.ts
rm -rf src/components/watch-party src/app/api/watch-party
rm -f src/server/watch-party-ws.ts src/lib/kodik-player-control.ts
rm -f scripts/ws-create-test.mjs scripts/test-ws.mjs scripts/fix-nginx-ws.sh
rm -f src/middleware.ts src/src/middleware.ts src/src/proxy.ts

deploy_progress 2 "npm ci"
echo "[deploy] npm ci uses quiet output; errors remain visible; timeout ${NPM_CI_TIMEOUT} (SIGKILL +15s)"
# Without -k, GNU timeout only sends SIGTERM and can wait forever if npm ignores it
# (seen on prod: npm ci hung 15m+ with ~21s CPU while heartbeat kept printing).
run_with_heartbeat "npm ci" 15 timeout -k 15s "$NPM_CI_TIMEOUT" npm ci --no-audit --no-fund --progress=false --loglevel=error

deploy_progress 3 "prisma generate"
npx prisma generate
echo "[deploy] prisma generate done"

deploy_progress 4 "prisma db push"
npx prisma db push --skip-generate --accept-data-loss
echo "[deploy] prisma db push done"

BUILD_FILE="$APP_DIR/.build-number"
BUILD_NUM=$(($(cat "$BUILD_FILE" 2>/dev/null || echo 0) + 1))
echo "$BUILD_NUM" > "$BUILD_FILE"
export BUILD_NUMBER="$BUILD_NUM"
echo "[deploy] build number: $BUILD_NUM"

deploy_progress 5 "cover cache setup"
bash scripts/setup-cover-cache.sh

deploy_progress 6 "next build"
# Останавливаем до удаления .next — иначе rm/build падают на занятом fetch-cache.
if systemctl is-active --quiet "$SERVICE_NAME"; then
  systemctl stop "$SERVICE_NAME"
fi
rm -rf .next
npm run build
echo "[deploy] next build done"

deploy_progress 7 "chown .next"
chown -R www-data:www-data "$APP_DIR/.next"

deploy_progress 8 "restart $SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
if systemctl cat "$WATCH_PARTY_SERVICE_NAME" >/dev/null 2>&1; then
  echo "[deploy] restart $WATCH_PARTY_SERVICE_NAME"
  systemctl restart "$WATCH_PARTY_SERVICE_NAME"
else
  echo "[deploy] $WATCH_PARTY_SERVICE_NAME service not installed; skip"
fi
sleep 3

deploy_progress 9 "cron and notification bots"
bash scripts/install-kodik-sync-cron.sh
bash scripts/install-telegram-bot-service.sh
bash scripts/install-vk-bot-service.sh

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "[deploy] ERROR: $SERVICE_NAME is not active" >&2
  systemctl status "$SERVICE_NAME" --no-pager || true
  exit 1
fi

if systemctl cat "$WATCH_PARTY_SERVICE_NAME" >/dev/null 2>&1; then
  if ! systemctl is-active --quiet "$WATCH_PARTY_SERVICE_NAME"; then
    echo "[deploy] ERROR: $WATCH_PARTY_SERVICE_NAME is not active" >&2
    systemctl status "$WATCH_PARTY_SERVICE_NAME" --no-pager || true
    exit 1
  fi
fi

deploy_progress 10 "site check"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL")
echo "[deploy] site: $HTTP_CODE ($SITE_URL)"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[deploy] ERROR: expected HTTP 200" >&2
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
  exit 1
fi

SERVICE_SUBSTATE=$(systemctl show "$SERVICE_NAME" -p SubState --value 2>/dev/null || echo "unknown")
SERVICE_ACTIVE=$(systemctl show "$SERVICE_NAME" -p ActiveState --value 2>/dev/null || echo "unknown")
DEPLOY_TIME=$(date '+%Y-%m-%d %H:%M:%S %Z')

echo ""
echo "============================================================"
echo "  DEPLOY REPORT - SUCCESS"
echo "============================================================"
echo "  Time:         $DEPLOY_TIME"
echo "  Build:        #$BUILD_NUM"
echo "  App dir:      $APP_DIR"
echo ""
echo "  [OK] Archive extracted"
echo "  [OK] npm ci"
echo "  [OK] Prisma generate + db push"
echo "  [OK] Cover cache setup"
echo "  [OK] Next.js production build"
echo "  [OK] Service $SERVICE_NAME: $SERVICE_ACTIVE ($SERVICE_SUBSTATE)"
if systemctl cat "$WATCH_PARTY_SERVICE_NAME" >/dev/null 2>&1; then
  WATCH_PARTY_SERVICE_SUBSTATE=$(systemctl show "$WATCH_PARTY_SERVICE_NAME" -p SubState --value 2>/dev/null || echo "unknown")
  WATCH_PARTY_SERVICE_ACTIVE=$(systemctl show "$WATCH_PARTY_SERVICE_NAME" -p ActiveState --value 2>/dev/null || echo "unknown")
  echo "  [OK] Service $WATCH_PARTY_SERVICE_NAME: $WATCH_PARTY_SERVICE_ACTIVE ($WATCH_PARTY_SERVICE_SUBSTATE)"
fi
echo "  [OK] Kodik sync cron"
echo "  [OK] Telegram bot service"
echo "  [OK] VK bot service"
echo "  [OK] Site check: $SITE_URL → HTTP $HTTP_CODE"
echo ""
echo "  Production is up and running."
echo "============================================================"
echo "[deploy] success (build #$BUILD_NUM)"

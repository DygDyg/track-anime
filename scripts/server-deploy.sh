#!/bin/bash
set -e
cd /var/www/ta_new

tar -xzf /tmp/ta_deploy.tar.gz
rm -f /tmp/ta_deploy.tar.gz

# Удаляем устаревшие файлы, которые tar не перезаписывает при удалении из репозитория
rm -f server.ts
rm -rf src/components/watch-party src/lib/watch-party src/app/api/watch-party
rm -f src/server/watch-party-ws.ts src/lib/kodik-player-control.ts
rm -f scripts/ws-create-test.mjs scripts/test-ws.mjs scripts/fix-nginx-ws.sh

npm ci
npx prisma generate
npx prisma db push --skip-generate --accept-data-loss

BUILD_FILE="/var/www/ta_new/.build-number"
BUILD_NUM=$(($(cat "$BUILD_FILE" 2>/dev/null || echo 0) + 1))
echo "$BUILD_NUM" > "$BUILD_FILE"
export BUILD_NUMBER="$BUILD_NUM"
echo "[deploy] build number: $BUILD_NUM"

bash scripts/setup-cover-cache.sh

rm -rf .next
npm run build
chown -R www-data:www-data /var/www/ta_new/.next
systemctl restart track-anime
sleep 3
bash scripts/install-kodik-sync-cron.sh
systemctl is-active track-anime
curl -s -o /dev/null -w 'site:%{http_code}\n' https://ta.dygdyg.ru/

#!/bin/bash
# Пост-деплой на сервере после WSL fast deploy (без npm run build).
set -euo pipefail

cd /var/www/ta_new

LOCK_CHANGED="${LOCK_CHANGED:-0}"
SCHEMA_CHANGED="${SCHEMA_CHANGED:-0}"

if [[ "${LOCK_CHANGED}" == "1" ]]; then
  echo "[server-deploy-fast] package-lock изменился → npm ci"
  npm ci
else
  echo "[server-deploy-fast] package-lock без изменений → skip npm ci"
fi

echo "[server-deploy-fast] prisma generate"
npx prisma generate

if [[ "${SCHEMA_CHANGED}" == "1" ]]; then
  echo "[server-deploy-fast] schema изменилась → db push"
  npx prisma db push --skip-generate --accept-data-loss
else
  echo "[server-deploy-fast] schema без изменений → skip db push"
fi

chown -R www-data:www-data /var/www/ta_new/.next

systemctl restart track-anime
sleep 3

if systemctl is-active --quiet track-anime; then
  echo "service:active"
else
  echo "service:FAILED"
  systemctl status track-anime --no-pager -l || true
  exit 1
fi

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' https://ta.dygdyg.ru/)"
echo "site:${HTTP_CODE}"

if [[ "${HTTP_CODE}" != "200" ]]; then
  exit 1
fi

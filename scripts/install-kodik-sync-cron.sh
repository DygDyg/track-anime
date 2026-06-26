#!/bin/bash
set -e

APP_DIR="/var/www/ta_new"
CRON_MARKER="kodik:sync:scheduled"
CRON_LINE="* * * * * cd ${APP_DIR} && /usr/bin/npm run kodik:sync:scheduled >> ${APP_DIR}/logs/kodik-sync.log 2>&1"

mkdir -p "${APP_DIR}/logs"

if crontab -l 2>/dev/null | grep -qF "${CRON_MARKER}"; then
  echo "kodik-sync cron already installed"
else
  (crontab -l 2>/dev/null | grep -vF "${CRON_MARKER}" || true; echo "${CRON_LINE}") | crontab -
  echo "kodik-sync cron installed (every minute, interval from admin settings)"
fi

#!/bin/bash
# Отключить автоперезагрузку 03:00 и 15:00 (оставляет backup crontab)
set -euo pipefail

TMP="$(mktemp)"
crontab -l > "$TMP"
cp "$TMP" "/root/crontab.bak.$(date +%Y%m%d%H%M)"

sed -i '/shutdown -r now/s/^/# disabled-perf-tuning: /' "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "reboot cron disabled (backup: /root/crontab.bak.*)"
crontab -l | grep -E "shutdown|disabled" || true

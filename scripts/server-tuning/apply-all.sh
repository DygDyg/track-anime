#!/bin/bash
# Применить настройки производительности на сервере (nginx + php-fpm)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$DIR/apply-php-fpm.sh"
bash "$DIR/apply-nginx-timing.sh"
bash "$DIR/enable-swap.sh"
bash "$DIR/disable-daily-reboot-cron.sh"
echo "done"

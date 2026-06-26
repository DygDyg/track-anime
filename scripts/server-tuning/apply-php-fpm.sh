#!/bin/bash
# PHP-FPM: больше воркеров, slowlog, лимит времени запроса
set -euo pipefail

POOL="/etc/php/8.2/fpm/pool.d/www.conf"

cp -a "$POOL" "${POOL}.bak.$(date +%Y%m%d)"

sed -i 's/^pm.max_children = .*/pm.max_children = 15/' "$POOL"
sed -i 's/^pm.start_servers = .*/pm.start_servers = 4/' "$POOL"
sed -i 's/^pm.min_spare_servers = .*/pm.min_spare_servers = 2/' "$POOL"
sed -i 's/^pm.max_spare_servers = .*/pm.max_spare_servers = 8/' "$POOL"

grep -q '^request_terminate_timeout' "$POOL" || \
  echo 'request_terminate_timeout = 120' >> "$POOL"
sed -i 's/^;request_terminate_timeout = .*/request_terminate_timeout = 120/' "$POOL"
sed -i 's/^request_terminate_timeout = .*/request_terminate_timeout = 120/' "$POOL"

grep -q '^request_slowlog_timeout' "$POOL" || \
  echo 'request_slowlog_timeout = 5s' >> "$POOL"
sed -i 's/^;request_slowlog_timeout = .*/request_slowlog_timeout = 5s/' "$POOL"
sed -i 's/^request_slowlog_timeout = .*/request_slowlog_timeout = 5s/' "$POOL"

grep -q '^slowlog' "$POOL" || \
  echo 'slowlog = /var/log/php8.2-fpm-slow.log' >> "$POOL"
sed -i 's|^;slowlog = .*|slowlog = /var/log/php8.2-fpm-slow.log|' "$POOL"

systemctl restart php8.2-fpm
echo "php-fpm: max_children=15, slowlog, terminate_timeout=120s"

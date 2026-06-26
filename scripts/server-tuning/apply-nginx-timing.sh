#!/bin/bash
set -euo pipefail

NGINX_CONF="/etc/nginx/nginx.conf"

if ! grep -q 'log_format ta_timing' "$NGINX_CONF"; then
  sed -i "/access_log \/var\/log\/nginx\/access.log;/a\\
\\
\tlog_format ta_timing '\$remote_addr - \$remote_user [\$time_local] \"\$request\" \$status \$body_bytes_sent rt=\$request_time uct=\$upstream_connect_time urt=\$upstream_response_time \"\$http_referer\" \"\$http_user_agent\"';" "$NGINX_CONF"
fi

if ! grep -q 'ta.dygdyg.timing.log' "$NGINX_CONF"; then
  sed -i "/server_name ta.dygdyg.ru;/,/location \//{
    /location \//a\\
        access_log /var/log/nginx/ta.dygdyg.timing.log ta_timing;
  }" "$NGINX_CONF"
fi

sed -i 's/proxy_read_timeout 86400;/proxy_read_timeout 120;/g' "$NGINX_CONF" || true
sed -i 's/proxy_send_timeout 86400;/proxy_send_timeout 120;/g' "$NGINX_CONF" || true

nginx -t
systemctl reload nginx
echo "nginx: timing log + proxy timeout 120s applied"

#!/bin/bash
# Daily host reboot at 05:00 Europe/Moscow (independent of server local TZ).
# Idempotent: writes /etc/cron.d/track-anime-reboot
set -euo pipefail

OUT=/etc/cron.d/track-anime-reboot
cat > "$OUT" <<'EOF'
# Track Anime — daily reboot 05:00 Moscow time
SHELL=/bin/bash
PATH=/usr/sbin:/usr/bin:/sbin:/bin
CRON_TZ=Europe/Moscow
0 5 * * * root /sbin/reboot
EOF
chmod 644 "$OUT"

# Ensure tzdata has Europe/Moscow
if [ ! -e /usr/share/zoneinfo/Europe/Moscow ]; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tzdata
fi

echo "Installed $OUT"
cat "$OUT"

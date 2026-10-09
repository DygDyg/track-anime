#!/bin/bash
# Disable Track Anime daily reboot cron (/etc/cron.d + legacy root crontab lines).
set -euo pipefail

if [ -f /etc/cron.d/track-anime-reboot ]; then
  mv /etc/cron.d/track-anime-reboot "/root/track-anime-reboot.cron.bak.$(date +%Y%m%d%H%M)"
  echo "disabled /etc/cron.d/track-anime-reboot (backup in /root/)"
fi

if crontab -l >/tmp/ta_cron_reboot.txt 2>/dev/null; then
  cp /tmp/ta_cron_reboot.txt "/root/crontab.bak.$(date +%Y%m%d%H%M)"
  sed -i '/shutdown -r now/s/^/# disabled-perf-tuning: /' /tmp/ta_cron_reboot.txt
  sed -i '/\/sbin\/reboot/s/^/# disabled-daily-reboot: /' /tmp/ta_cron_reboot.txt
  sed -i '/\/usr\/sbin\/reboot/s/^/# disabled-daily-reboot: /' /tmp/ta_cron_reboot.txt
  crontab /tmp/ta_cron_reboot.txt
  rm -f /tmp/ta_cron_reboot.txt
  echo "legacy root crontab reboot lines commented if present"
fi

echo "daily reboot cron disabled"
ls /etc/cron.d/track-anime-reboot 2>/dev/null || echo "(no /etc/cron.d/track-anime-reboot)"

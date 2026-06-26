#!/bin/bash
# 2G swap если swap отсутствует
set -euo pipefail

if swapon --show | grep -q .; then
  echo "swap already exists"
  swapon --show
  exit 0
fi

fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo "swap 2G enabled"
free -h

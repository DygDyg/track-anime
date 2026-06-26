#!/bin/bash
# Подключает legacy-кэш обложек (/var/www/cover) через COVER_CACHE_DIR в .env.
# Symlink в data/cover-cache не используем — Turbopack падает при сборке.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
LOCAL_CACHE_DIR="$APP_DIR/data/cover-cache"
LEGACY_PRIMARY="/var/www/cover"
LEGACY_EXTRA=(
  "/var/www/html/cover"
  "/var/www/cover/cover"
)
ENV_FILE="$APP_DIR/.env"

mkdir -p "$APP_DIR/data"

count_webp() {
  local dir="$1"
  local resolved="$dir"
  if [ -L "$dir" ]; then
    resolved=$(readlink -f "$dir")
  fi
  find "$resolved" -maxdepth 1 -type f -name '*.webp' 2>/dev/null | wc -l
}

resolve_cache_dir() {
  if [ -f "$ENV_FILE" ]; then
    local from_env
    from_env=$(grep -E '^COVER_CACHE_DIR=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ -n "$from_env" ] && [ -d "$from_env" ]; then
      echo "$from_env"
      return
    fi
  fi
  echo "$LOCAL_CACHE_DIR"
}

set_cover_cache_env() {
  local target="$1"
  if [ ! -f "$ENV_FILE" ]; then
    echo "COVER_CACHE_DIR=$target" >> "$ENV_FILE"
    return
  fi
  if grep -q '^COVER_CACHE_DIR=' "$ENV_FILE"; then
    sed -i "s|^COVER_CACHE_DIR=.*|COVER_CACHE_DIR=$target|" "$ENV_FILE"
  else
    echo "COVER_CACHE_DIR=$target" >> "$ENV_FILE"
  fi
}

if [ -L "$LOCAL_CACHE_DIR" ]; then
  echo "[cover] removing symlink $LOCAL_CACHE_DIR (breaks next build)"
  rm "$LOCAL_CACHE_DIR"
fi
mkdir -p "$LOCAL_CACHE_DIR"

if [ -d "$LEGACY_PRIMARY" ]; then
  set_cover_cache_env "$LEGACY_PRIMARY"
  echo "[cover] COVER_CACHE_DIR=$LEGACY_PRIMARY"
else
  echo "[cover] legacy dir not found, using $LOCAL_CACHE_DIR"
fi

CACHE_DIR=$(resolve_cache_dir)

copied=0
for legacy in "$LEGACY_PRIMARY" "${LEGACY_EXTRA[@]}"; do
  [ -d "$legacy" ] || continue
  for file in "$legacy"/*.webp; do
    [ -f "$file" ] || continue
    base=$(basename "$file")
    if [ ! -f "$CACHE_DIR/$base" ]; then
      cp -a "$file" "$CACHE_DIR/$base"
      copied=$((copied + 1))
    fi
  done
done

if [ "$copied" -gt 0 ]; then
  echo "[cover] copied $copied missing webp files into $CACHE_DIR"
fi

chown -R www-data:www-data "$LOCAL_CACHE_DIR" 2>/dev/null || true
if [ "$CACHE_DIR" != "$LOCAL_CACHE_DIR" ]; then
  chown -R www-data:www-data "$CACHE_DIR" 2>/dev/null || true
fi

count=$(count_webp "$CACHE_DIR")
echo "[cover] cache ready: $count webp files at $CACHE_DIR"

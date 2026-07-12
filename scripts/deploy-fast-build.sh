#!/bin/bash
# Linux-сборка в WSL (без upload на сервер).
set -euo pipefail

APP_DIR="/mnt/d/GitHub/ta_new"
BUILD_DIR="${HOME}/.cache/ta_new-build"

ensure_node() {
  export NVM_DIR="${HOME}/.nvm"
  if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "${NVM_DIR}/nvm.sh"
    nvm use default >/dev/null 2>&1 || true
  fi

  local major=0
  if command -v node >/dev/null 2>&1; then
    major="$(node -p "process.versions.node.split('.')[0]")"
  fi

  if [[ "${major}" -lt 20 ]]; then
    echo "[deploy-fast-build] Node ${major:-?} слишком старый, нужен Node 20+"
    exit 1
  fi

  echo "[deploy-fast-build] Node $(node -v), npm $(npm -v)"
}

sync_to_build_dir() {
  mkdir -p "${BUILD_DIR}"
  echo "[deploy-fast-build] sync sources → ${BUILD_DIR}"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    --exclude .env \
    --exclude "*.tar.gz" \
    --exclude .cursor \
    "${APP_DIR}/" "${BUILD_DIR}/"

  if [[ -d "${BUILD_DIR}/bg" ]]; then
    rm -f "${BUILD_DIR}/public/bg"
    ln -sfn ../bg "${BUILD_DIR}/public/bg"
  fi

  if [[ -f "${APP_DIR}/.env" ]]; then
    cp "${APP_DIR}/.env" "${BUILD_DIR}/.env"
  fi

  cat >> "${BUILD_DIR}/.env.local" <<'EOF'
NEXT_FONT_GOOGLE_MOCKED=1
EOF
}

ensure_node
sync_to_build_dir
cd "${BUILD_DIR}"

echo "[deploy-fast-build] npm ci + build..."
npm ci
NEXT_FONT_GOOGLE_MOCKED=1 npx next build --webpack
node scripts/write-build-info.mjs

echo "[deploy-fast-build] OK → ${BUILD_DIR}"

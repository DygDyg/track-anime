#!/bin/bash
# Entry point for passwordless sudo from www-data (Next.js admin/webhook).
# Usage: ta-git-deploy-trigger.sh [trigger] [force]
#   trigger: admin|webhook|actions|cli
#   force:   0|1
# Install: bash scripts/install-git-deploy-sudoers.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
export APP_DIR
export GIT_DEPLOY_TRIGGER="${1:-${GIT_DEPLOY_TRIGGER:-cli}}"
export GIT_DEPLOY_FORCE="${2:-${GIT_DEPLOY_FORCE:-0}}"
export GIT_DEPLOY_BRANCH="${GIT_DEPLOY_BRANCH:-master}"
export GIT_DEPLOY_REMOTE="${GIT_DEPLOY_REMOTE:-origin}"
export GIT_DEPLOY_STATUS_FILE="${GIT_DEPLOY_STATUS_FILE:-/tmp/ta_deploy_status.json}"
export DEPLOY_LOG="${DEPLOY_LOG:-/tmp/ta_deploy.log}"
export DEPLOY_SCREEN_SESSION="${DEPLOY_SCREEN_SESSION:-ta_deploy}"

cd "$APP_DIR"

if [ ! -f scripts/server-deploy-git-bg.sh ]; then
  echo "[ta-git-deploy] ERROR: scripts/server-deploy-git-bg.sh missing in $APP_DIR" >&2
  exit 1
fi

sed -i 's/\r$//' scripts/server-deploy-git-bg.sh scripts/server-deploy-from-git.sh scripts/server-deploy.sh 2>/dev/null || true
exec bash scripts/server-deploy-git-bg.sh "$APP_DIR" "$DEPLOY_LOG"

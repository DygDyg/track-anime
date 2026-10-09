#!/bin/bash
# One-time (or after path change): allow www-data to start git deploy without password.
# Run as root on the production host.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
SERVICE_USER="${SERVICE_USER:-www-data}"
TRIGGER_SRC="$APP_DIR/scripts/ta-git-deploy-trigger.sh"
TRIGGER_DST="/usr/local/sbin/ta-git-deploy-trigger"
SUDOERS_FILE="/etc/sudoers.d/track-anime-git-deploy"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

if [ ! -f "$TRIGGER_SRC" ]; then
  echo "Missing $TRIGGER_SRC — deploy app code first" >&2
  exit 1
fi

# Root-owned wrapper; args: [trigger] [force]
cat > "$TRIGGER_DST" <<EOF
#!/bin/bash
set -euo pipefail
export APP_DIR="${APP_DIR}"
export GIT_DEPLOY_BRANCH="\${GIT_DEPLOY_BRANCH:-master}"
export GIT_DEPLOY_REMOTE="\${GIT_DEPLOY_REMOTE:-origin}"
export GIT_DEPLOY_STATUS_FILE="\${GIT_DEPLOY_STATUS_FILE:-/tmp/ta_deploy_status.json}"
export DEPLOY_LOG="\${DEPLOY_LOG:-/tmp/ta_deploy.log}"
exec bash "${APP_DIR}/scripts/ta-git-deploy-trigger.sh" "\${1:-cli}" "\${2:-0}"
EOF
chmod 755 "$TRIGGER_DST"

# Path without args → any arguments allowed (sudoers).
cat > "$SUDOERS_FILE" <<EOF
# Track Anime — git pull deploy from Next.js (www-data)
${SERVICE_USER} ALL=(root) NOPASSWD: ${TRIGGER_DST}
EOF
chmod 440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE"

echo "Installed: $TRIGGER_DST"
echo "Sudoers:   $SUDOERS_FILE"
echo "Test:      sudo -u $SERVICE_USER sudo -n $TRIGGER_DST admin 0"
echo "Env:       GIT_DEPLOY_WEBHOOK_SECRET + GIT_DEPLOY_ENABLED in track-anime.service"

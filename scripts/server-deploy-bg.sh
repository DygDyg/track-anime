#!/bin/bash
# Запускает server-deploy.sh в screen — переживает обрыв SSH и можно attach.
set -euo pipefail

APP_DIR="${APP_DIR:-${1:-/var/www/ta_new}}"
LOG="${DEPLOY_LOG:-${2:-/tmp/ta_deploy.log}}"
SESSION="${DEPLOY_SCREEN_SESSION:-ta_deploy}"
EXITFILE="/tmp/ta_deploy.exit"

if ! command -v screen >/dev/null 2>&1; then
  echo "[deploy-bg] screen not found. Install: apt-get install -y screen" >&2
  exit 1
fi

if screen -list 2>/dev/null | grep -qE "[[:space:]][0-9]+\\.${SESSION}[[:space:]]"; then
  echo "[deploy-bg] already running (screen -r $SESSION). Log: $LOG" >&2
  exit 2
fi

rm -f "$EXITFILE"
: > "$LOG"

cd "$APP_DIR"

screen -dmS "$SESSION" bash -c "
  set -euo pipefail
  ec=0
  trap 'echo \$ec > \"$EXITFILE\"' EXIT
  {
    echo \"[deploy-bg] started \$(date -Iseconds)\"
    bash scripts/server-deploy.sh || ec=\$?
    if [ \"\$ec\" -eq 0 ]; then
      echo \"[deploy-bg] finished ok \$(date -Iseconds)\"
    else
      echo \"[deploy-bg] finished with error \$ec \$(date -Iseconds)\" >&2
    fi
    exit \"\$ec\"
  } 2>&1 | tee -a \"$LOG\"
"

echo "[deploy-bg] screen session: $SESSION"
echo "[deploy-bg] attach: screen -r $SESSION"
echo "[deploy-bg] log: $LOG"

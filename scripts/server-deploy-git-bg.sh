#!/bin/bash
# Запускает server-deploy-from-git.sh в screen — переживает обрыв SSH/webhook.
set -euo pipefail

APP_DIR="${APP_DIR:-${1:-/var/www/ta_new}}"
LOG="${DEPLOY_LOG:-${2:-/tmp/ta_deploy.log}}"
SESSION="${DEPLOY_SCREEN_SESSION:-ta_deploy}"
EXITFILE="/tmp/ta_deploy.exit"
STATUS_FILE="${GIT_DEPLOY_STATUS_FILE:-/tmp/ta_deploy_status.json}"

if ! command -v screen >/dev/null 2>&1; then
  echo "[deploy-git-bg] screen not found. Install: apt-get install -y screen" >&2
  exit 1
fi

if screen -list 2>/dev/null | grep -qE "[[:space:]][0-9]+\\.${SESSION}[[:space:]]"; then
  echo "[deploy-git-bg] already running (screen -r $SESSION). Log: $LOG" >&2
  exit 2
fi

rm -f "$EXITFILE"
: > "$LOG"
chmod 644 "$LOG" 2>/dev/null || true

cd "$APP_DIR"
for f in scripts/server-deploy.sh scripts/server-deploy-from-git.sh scripts/server-deploy-git-bg.sh scripts/ta-git-deploy-trigger.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f"
done

# seed status for readers before screen starts
TRIGGER="${GIT_DEPLOY_TRIGGER:-cli}"
BRANCH="${GIT_DEPLOY_BRANCH:-master}"
python3 - "$STATUS_FILE" "$TRIGGER" "$BRANCH" "$LOG" <<'PY'
import json, sys, os
from datetime import datetime, timezone
path, trigger, branch, log = sys.argv[1:5]
data = {
    "version": 1,
    "state": "starting",
    "trigger": trigger,
    "branch": branch,
    "startedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    "finishedAt": None,
    "exitCode": None,
    "commitBefore": None,
    "commitAfter": None,
    "message": "Запуск screen-сессии деплоя",
    "logFile": log,
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
os.chmod(path, 0o644)
PY

# export env into screen
FORCE="${GIT_DEPLOY_FORCE:-0}"
REMOTE="${GIT_DEPLOY_REMOTE:-origin}"

screen -dmS "$SESSION" bash -c "
  set -euo pipefail
  ec=0
  trap 'echo \$ec > \"$EXITFILE\"; chmod 644 \"$EXITFILE\" 2>/dev/null || true' EXIT
  {
    echo \"[deploy-git-bg] started \$(date -Iseconds) trigger=$TRIGGER\"
    export APP_DIR=\"$APP_DIR\"
    export GIT_DEPLOY_BRANCH=\"$BRANCH\"
    export GIT_DEPLOY_REMOTE=\"$REMOTE\"
    export GIT_DEPLOY_FORCE=\"$FORCE\"
    export GIT_DEPLOY_TRIGGER=\"$TRIGGER\"
    export GIT_DEPLOY_STATUS_FILE=\"$STATUS_FILE\"
    bash scripts/server-deploy-from-git.sh || ec=\$?
    if [ \"\$ec\" -eq 0 ]; then
      echo \"[deploy-git-bg] finished ok \$(date -Iseconds)\"
    else
      echo \"[deploy-git-bg] finished with error \$ec \$(date -Iseconds)\" >&2
    fi
    exit \"\$ec\"
  } 2>&1 | tee -a \"$LOG\"
"

echo "[deploy-git-bg] screen session: $SESSION"
echo "[deploy-git-bg] attach: screen -r $SESSION"
echo "[deploy-git-bg] log: $LOG"
echo "[deploy-git-bg] status: $STATUS_FILE"

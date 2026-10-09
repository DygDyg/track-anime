#!/bin/bash
# Обновляет дерево из GitHub и запускает server-deploy.sh (DEPLOY_SOURCE=git).
# Вызывать от root (или через ta-git-deploy-trigger.sh / server-deploy-git-bg.sh).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ta_new}"
BRANCH="${GIT_DEPLOY_BRANCH:-master}"
REMOTE="${GIT_DEPLOY_REMOTE:-origin}"
FORCE="${GIT_DEPLOY_FORCE:-0}"
STATUS_FILE="${GIT_DEPLOY_STATUS_FILE:-/tmp/ta_deploy_status.json}"

write_status() {
  local state="$1"
  local message="$2"
  local exit_code="${3:-}"
  local finished_at=""
  if [ "$state" = "success" ] || [ "$state" = "error" ] || [ "$state" = "skipped" ]; then
    finished_at="$(date -Iseconds)"
  fi
  local started_at
  started_at="$(date -Iseconds)"
  local before="${COMMIT_BEFORE:-}"
  local after="${COMMIT_AFTER:-}"
  local trigger="${GIT_DEPLOY_TRIGGER:-cli}"
  local ec_json="null"
  if [ -n "$exit_code" ]; then ec_json="$exit_code"; fi
  local finished_json="null"
  if [ -n "$finished_at" ]; then finished_json="\"$finished_at\""; fi

  # Prefer python3; fallback to minimal JSON if missing.
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$STATUS_FILE" "$state" "$message" "$exit_code" "$finished_at" \
      "$before" "$after" "$BRANCH" "$trigger" <<'PY'
import json, sys, os
from datetime import datetime, timezone
path, state, message, exit_code, finished_at, before, after, branch, trigger = sys.argv[1:10]
prev = {}
try:
    with open(path, "r", encoding="utf-8") as f:
        prev = json.load(f)
except Exception:
    pass
data = {
    "version": 1,
    "state": state,
    "trigger": trigger or prev.get("trigger") or "cli",
    "branch": branch,
    "startedAt": prev.get("startedAt") or datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    "finishedAt": finished_at or None,
    "exitCode": int(exit_code) if exit_code not in ("", None) else None,
    "commitBefore": before or prev.get("commitBefore"),
    "commitAfter": after or prev.get("commitAfter"),
    "message": message,
    "logFile": prev.get("logFile") or "/tmp/ta_deploy.log",
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
os.chmod(path, 0o644)
PY
  else
    # Minimal fallback (message without quotes/newlines)
    local safe_msg
    safe_msg="$(printf '%s' "$message" | tr -d '"\n\r')"
    cat > "$STATUS_FILE" <<EOF
{
  "version": 1,
  "state": "$state",
  "trigger": "$trigger",
  "branch": "$BRANCH",
  "startedAt": "$started_at",
  "finishedAt": $finished_json,
  "exitCode": $ec_json,
  "commitBefore": "$before",
  "commitAfter": "$after",
  "message": "$safe_msg",
  "logFile": "/tmp/ta_deploy.log"
}
EOF
    chmod 644 "$STATUS_FILE" 2>/dev/null || true
  fi
}

cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "[deploy-git] ERROR: $APP_DIR is not a git checkout. Bootstrap once (see docs/DEPLOY.md)." >&2
  write_status "error" "Каталог не является git-репозиторием" "1"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[deploy-git] ERROR: git not installed" >&2
  write_status "error" "git не установлен" "1"
  exit 1
fi

COMMIT_BEFORE="$(git rev-parse HEAD 2>/dev/null || echo "")"
write_status "running" "fetch $REMOTE/$BRANCH" ""

echo "[deploy-git] fetch $REMOTE $BRANCH"
git fetch --prune "$REMOTE" "$BRANCH"

COMMIT_AFTER="$(git rev-parse "$REMOTE/$BRANCH")"
echo "[deploy-git] local=$COMMIT_BEFORE remote=$COMMIT_AFTER"

if [ "$FORCE" != "1" ] && [ -n "$COMMIT_BEFORE" ] && [ "$COMMIT_BEFORE" = "$COMMIT_AFTER" ]; then
  echo "[deploy-git] already up to date; skip build (GIT_DEPLOY_FORCE=1 to rebuild)"
  write_status "skipped" "Уже на $COMMIT_AFTER — сборка пропущена" "0"
  bash scripts/notify-deploy-discord.sh \
    "skipped" \
    "Уже на $COMMIT_AFTER — сборка пропущена" \
    "0" \
    "" \
    "$COMMIT_AFTER" \
    "${GIT_DEPLOY_TRIGGER:-cli}" \
    "git" \
    >/dev/null 2>&1 || true
  exit 0
fi

echo "[deploy-git] reset --hard $REMOTE/$BRANCH"
git reset --hard "$REMOTE/$BRANCH"

for f in scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f"
done

write_status "running" "build + restart" ""
export DEPLOY_SOURCE=git
export APP_DIR
export DEPLOY_NOTIFY_COMMIT="$COMMIT_AFTER"
export DEPLOY_NOTIFY_TRIGGER="${GIT_DEPLOY_TRIGGER:-cli}"
set +e
bash scripts/server-deploy.sh
ec=$?
set -e

COMMIT_AFTER="$(git rev-parse HEAD 2>/dev/null || echo "$COMMIT_AFTER")"
if [ "$ec" -eq 0 ]; then
  write_status "success" "Деплой завершён ($COMMIT_AFTER)" "0"
else
  write_status "error" "Деплой завершился с ошибкой $ec" "$ec"
fi
exit "$ec"

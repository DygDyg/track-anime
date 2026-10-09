#!/bin/bash
# Optional Discord webhook notify after deploy.
# Env: DEPLOY_DISCORD_WEBHOOK_URL (or same key in APP_DIR/.env)
# Never fails the deploy (errors are logged and ignored).
set -u

APP_DIR="${APP_DIR:-/var/www/ta_new}"
SITE_URL="${SITE_URL:-https://track-anime.win/}"
STATUS="${1:-unknown}"          # success | error | skipped | started
MESSAGE="${2:-}"
EXIT_CODE="${3:-}"
BUILD_NUM="${4:-}"
COMMIT="${5:-}"
TRIGGER="${6:-}"
SOURCE="${7:-}"

resolve_webhook() {
  if [ -n "${DEPLOY_DISCORD_WEBHOOK_URL:-}" ]; then
    printf '%s' "$DEPLOY_DISCORD_WEBHOOK_URL"
    return
  fi
  if [ -f "$APP_DIR/.env" ]; then
    # shellcheck disable=SC2002
    local line
    line="$(grep -E '^[[:space:]]*DEPLOY_DISCORD_WEBHOOK_URL=' "$APP_DIR/.env" | tail -n 1 || true)"
    if [ -n "$line" ]; then
      line="${line#DEPLOY_DISCORD_WEBHOOK_URL=}"
      line="$(printf '%s' "$line" | tr -d '\r')"
      line="${line#\"}"
      line="${line%\"}"
      line="${line#\'}"
      line="${line%\'}"
      printf '%s' "$line"
      return
    fi
  fi
  printf ''
}

WEBHOOK="$(resolve_webhook)"
if [ -z "$WEBHOOK" ]; then
  exit 0
fi

if [ "$STATUS" = "skipped" ] && [ "${DEPLOY_DISCORD_NOTIFY_SKIPPED:-0}" != "1" ]; then
  exit 0
fi

case "$STATUS" in
  success) COLOR=5763719; TITLE="✅ Deploy OK" ;;
  error)   COLOR=15548997; TITLE="❌ Deploy failed" ;;
  skipped) COLOR=9807270; TITLE="⏭️ Deploy skipped" ;;
  started) COLOR=3447003; TITLE="🚀 Deploy started" ;;
  *)       COLOR=9807270; TITLE="Deploy: $STATUS" ;;
esac

# Escape JSON string fragments (minimal)
json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
    || printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\\n\r')"
}

MSG_JSON="$(json_escape "${MESSAGE:-—}")"
SITE_JSON="$(json_escape "$SITE_URL")"
TRIGGER_JSON="$(json_escape "${TRIGGER:-—}")"
SOURCE_JSON="$(json_escape "${SOURCE:-—}")"
COMMIT_SHORT="$(printf '%s' "${COMMIT:-}" | cut -c1-10)"
[ -n "$COMMIT_SHORT" ] || COMMIT_SHORT="—"
COMMIT_JSON="$(json_escape "$COMMIT_SHORT")"
BUILD_LABEL="${BUILD_NUM:-—}"
EXIT_LABEL="${EXIT_CODE:-—}"

BODY=$(cat <<EOF
{
  "username": "Track Anime Deploy",
  "embeds": [
    {
      "title": "$TITLE",
      "description": $MSG_JSON,
      "color": $COLOR,
      "fields": [
        {"name": "Site", "value": $SITE_JSON, "inline": false},
        {"name": "Build", "value": "$BUILD_LABEL", "inline": true},
        {"name": "Exit", "value": "$EXIT_LABEL", "inline": true},
        {"name": "Commit", "value": $COMMIT_JSON, "inline": true},
        {"name": "Trigger", "value": $TRIGGER_JSON, "inline": true},
        {"name": "Source", "value": $SOURCE_JSON, "inline": true}
      ],
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
    }
  ]
}
EOF
)

if ! command -v curl >/dev/null 2>&1; then
  echo "[deploy-discord] curl missing; skip notify" >&2
  exit 0
fi

HTTP_CODE="$(curl -sS -o /tmp/ta_deploy_discord_resp.txt -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  "$WEBHOOK" || true)"

if [ "$HTTP_CODE" != "204" ] && [ "$HTTP_CODE" != "200" ]; then
  echo "[deploy-discord] webhook HTTP $HTTP_CODE (ignored)" >&2
  tail -c 200 /tmp/ta_deploy_discord_resp.txt 2>/dev/null || true
  echo >&2
else
  echo "[deploy-discord] notified ($STATUS, HTTP $HTTP_CODE)"
fi

exit 0

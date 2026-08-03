#!/usr/bin/env bash
# Workshop keep-alive for PUF-AM hub (`npm run dev` / tsx server.ts).
# Restarts on exit so Cursor agent shell teardown / accidental crashes
# don't leave localhost:3000 dead.
#
# Usage:
#   nohup bash scripts/dev-keepalive.sh >/tmp/pufam-dev-keepalive.out 2>&1 &
#   disown
#   curl -sS http://127.0.0.1:3000/api/health
#
# Stop:
#   kill "$(cat /tmp/pufam-dev-keepalive.pid)" 2>/dev/null
#   pkill -f 'tsx server.ts' 2>/dev/null

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

LOG="${PUFAM_DEV_LOG:-/tmp/pufam-dev.log}"
PIDFILE="${PUFAM_DEV_PIDFILE:-/tmp/pufam-dev-keepalive.pid}"
SLEEP_SECS="${PUFAM_DEV_RESTART_SLEEP:-2}"

echo $$ >"$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG"
}

log "keepalive start root=$ROOT pid=$$ log=$LOG"

while true; do
  log "starting: npm run dev"
  # Do not use `set -e` around npm — we want to loop on any exit.
  npm run dev >>"$LOG" 2>&1
  code=$?
  log "npm run dev exited code=$code; restarting in ${SLEEP_SECS}s"
  sleep "$SLEEP_SECS"
done

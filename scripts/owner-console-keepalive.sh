#!/usr/bin/env bash
# Keep the PUFworks owner console up (secrets/owner-console/server.ts).
# Loopback only. Restart on exit so a menu launch is not tied to Cursor.
#
#   nohup bash scripts/owner-console-keepalive.sh >/tmp/pufam-owner-keepalive.out 2>&1 &
#   disown
#
# Stop:
#   kill "$(cat /tmp/pufam-owner-keepalive.pid)"
#   pkill -f 'secrets/owner-console/server.ts'

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

LOG="${PUFAM_OWNER_LOG:-/tmp/pufam-owner.log}"
PIDFILE="${PUFAM_OWNER_PIDFILE:-/tmp/pufam-owner-keepalive.pid}"
SLEEP_SECS="${PUFAM_OWNER_RESTART_SLEEP:-2}"

if [[ -z "${PUFAM_NODE_BIN:-}" ]]; then
  alias_target="${FNM_DIR:-$HOME/.local/share/fnm}/aliases/default"
  if [[ -L "$alias_target" ]]; then
    PUFAM_NODE_BIN="$(readlink -f "$alias_target")/bin"
  fi
fi
if [[ -n "${PUFAM_NODE_BIN:-}" && -d "$PUFAM_NODE_BIN" ]]; then
  export PATH="$PUFAM_NODE_BIN:$PATH"
fi

# Launcher flock lives on fd 9. Drop it if this process inherited the descriptor.
exec 9<&- || true

echo $$ >"$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG"
}

TSX="$ROOT/node_modules/.bin/tsx"
if [[ ! -x "$TSX" ]]; then
  log "tsx missing at $TSX"
  exit 1
fi

log "keepalive start root=$ROOT pid=$$ log=$LOG"

while true; do
  log "starting: tsx secrets/owner-console/server.ts"
  "$TSX" secrets/owner-console/server.ts >>"$LOG" 2>&1
  code=$?
  log "owner console exited code=$code; restarting in ${SLEEP_SECS}s"
  sleep "$SLEEP_SECS"
done

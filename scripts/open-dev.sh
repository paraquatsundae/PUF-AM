#!/usr/bin/env bash
# Open the PUF-AM workshop (npm run dev) without a terminal or Cursor.
#
# Starts scripts/dev-keepalive.sh when nothing is answering on :3000,
# waits until /api/health succeeds, then opens the app in the browser.
# A second launch leaves a healthy server alone and just opens the browser.
#
#   puf-am
#   or the "PUF-AM" item in the application menu

set -u

# $0 is ~/.local/bin/puf-am when launched from the menu; follow that symlink.
SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "$SCRIPT")/.." && pwd)"
URL="${PUFAM_DEV_URL:-http://127.0.0.1:3000}"
LOG="${PUFAM_DEV_LOG:-/tmp/pufam-dev.log}"
KEEPALIVE_LOG="${PUFAM_DEV_KEEPALIVE_LOG:-/tmp/pufam-dev-keepalive.out}"
PIDFILE="${PUFAM_DEV_PIDFILE:-/tmp/pufam-dev-keepalive.pid}"
LOCK="${PUFAM_DEV_LOCK:-/tmp/pufam-dev-open.lock}"

if [[ -z "${PUFAM_NODE_BIN:-}" ]]; then
  alias_target="${FNM_DIR:-$HOME/.local/share/fnm}/aliases/default"
  if [[ -L "$alias_target" ]]; then
    PUFAM_NODE_BIN="$(readlink -f "$alias_target")/bin"
  fi
fi

if [[ -n "${PUFAM_NODE_BIN:-}" && -x "$PUFAM_NODE_BIN/node" ]]; then
  export PATH="$PUFAM_NODE_BIN:$PATH"
fi

notify() {
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "PUF-AM" "$1"
  else
    printf 'PUF-AM: %s\n' "$1" >&2
  fi
}

health_ok() {
  curl -fsS --max-time 2 "$URL/api/health" >/dev/null 2>&1
}

exec 9>"$LOCK"
if ! flock -w 90 9; then
  notify "Still starting. Log: $LOG"
  exit 1
fi

keepalive_live() {
  [[ -f "$PIDFILE" ]] || return 1
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

if ! health_ok; then
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    notify "Node is not on PATH. Expected fnm at ${PUFAM_NODE_BIN:-<unset>}."
    exit 1
  fi
  if ! keepalive_live; then
    cd "$ROOT" || exit 1
    # New session so closing this launcher (or Cursor) does not kill the hub.
    # Close the lock fd so the hub does not hold it after this launcher exits.
    setsid nohup bash "$ROOT/scripts/dev-keepalive.sh" >>"$KEEPALIVE_LOG" 2>&1 9<&- < /dev/null &
    disown || true
  fi
  ready=0
  for _ in $(seq 1 90); do
    if health_ok; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" != 1 ]]; then
    notify "Did not start. See $LOG"
    exit 1
  fi
fi

if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 9<&- &
  disown || true
fi

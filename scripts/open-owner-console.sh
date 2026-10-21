#!/usr/bin/env bash
# Open the PUFworks owner console without a terminal or Cursor.
#
# Starts scripts/owner-console-keepalive.sh when nothing is answering on
# 127.0.0.1:3947, then opens a standalone browser window. A second launch
# leaves a healthy console alone and just opens the window.
#
#   puf-am-owner
#   or "PUF-AM owner" in the application menu

set -u

SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "$SCRIPT")/.." && pwd)"
URL="${PUFAM_OWNER_URL:-http://127.0.0.1:3947}"
LOG="${PUFAM_OWNER_LOG:-/tmp/pufam-owner.log}"
KEEPALIVE_LOG="${PUFAM_OWNER_KEEPALIVE_LOG:-/tmp/pufam-owner-keepalive.out}"
PIDFILE="${PUFAM_OWNER_PIDFILE:-/tmp/pufam-owner-keepalive.pid}"
LOCK="${PUFAM_OWNER_LOCK:-/tmp/pufam-owner-open.lock}"

if [[ -z "${PUFAM_NODE_BIN:-}" ]]; then
  alias_target="${FNM_DIR:-$HOME/.local/share/fnm}/aliases/default"
  if [[ -L "$alias_target" ]]; then
    PUFAM_NODE_BIN="$(readlink -f "$alias_target")/bin"
  fi
fi

if [[ -n "${PUFAM_NODE_BIN:-}" && -x "$PUFAM_NODE_BIN/node" ]]; then
  export PATH="$PUFAM_NODE_BIN:$PATH"
fi
if [[ -d "$HOME/google-cloud-sdk/bin" ]]; then
  export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi

notify() {
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "PUF-AM owner" "$1"
  else
    printf 'PUF-AM owner: %s\n' "$1" >&2
  fi
}

console_up() {
  curl -fsS --max-time 2 "$URL/" >/dev/null 2>&1
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

if ! console_up; then
  if ! command -v node >/dev/null 2>&1; then
    notify "Node is not on PATH. Expected fnm at ${PUFAM_NODE_BIN:-<unset>}."
    exit 1
  fi
  if [[ ! -f "$ROOT/secrets/owner-console/server.ts" ]]; then
    notify "Owner console is not in this checkout."
    exit 1
  fi
  if ! keepalive_live; then
    cd "$ROOT" || exit 1
    # Close the lock fd so the console process does not hold it after this launcher exits.
    setsid nohup bash "$ROOT/scripts/owner-console-keepalive.sh" >>"$KEEPALIVE_LOG" 2>&1 9<&- < /dev/null &
    disown || true
  fi
  ready=0
  for _ in $(seq 1 90); do
    if console_up; then
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

open_window() {
  local brave=""
  for candidate in \
    /usr/bin/brave-browser-stable \
    /usr/bin/brave-browser \
    /usr/bin/google-chrome-stable \
    /usr/bin/google-chrome
  do
    if [[ -x "$candidate" ]]; then
      brave="$candidate"
      break
    fi
  done
  if [[ -n "$brave" ]]; then
    # Own profile so an already-open Brave does not swallow this into a tab.
    local profile="${PUFAM_OWNER_PROFILE:-$HOME/.local/share/puf-am-owner/browser}"
    mkdir -p "$profile"
    "$brave" \
      --app="$URL" \
      --user-data-dir="$profile" \
      --class=puf-am-owner \
      --name=puf-am-owner \
      >/dev/null 2>&1 9<&- &
    disown || true
    return
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 9<&- &
    disown || true
  fi
}

if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  open_window
fi

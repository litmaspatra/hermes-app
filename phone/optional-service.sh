#!/data/data/com.termux/files/usr/bin/bash
# Optional FastBrain and Hindsight Lite lifecycle manager for Hermes Mobile.
# Runs in Termux (NOT Debian). No automatic installs, upgrades, or wake locks.
# Does not start services at boot; caller must explicitly run `start`.
set -euo pipefail
umask 077
HOME_DIR="${HOME:?}"
STATE="$HOME_DIR/.hermes-mobile/optional-services"
mkdir -p "$STATE"
usage() {
  echo "Usage: $0 {status|start|stop} {fastbrain-router|fastbrain-minilm|hindsight-lite}"
  echo "Hindsight: set HINDSIGHT_LITE_START to an existing executable script path."
  exit 2
}
[ "$#" -eq 2 ] || usage
action="$1"
service="$2"
case "$action" in status|start|stop) ;; *) usage ;; esac
case "$service" in
  fastbrain-router)
    script="$HOME_DIR/FastBrain/scripts/start-fastbrain-router.sh"
    ;;
  fastbrain-minilm)
    script="$HOME_DIR/FastBrain/scripts/start-minilm.sh"
    ;;
  hindsight-lite)
    script="${HINDSIGHT_LITE_START:-}"
    ;;
  *) usage ;;
esac
pidfile="$STATE/$service.pid"
log="$STATE/$service.log"
running() {
  [ -f "$pidfile" ] || return 1
  pid=$(cat "$pidfile" 2>/dev/null) || return 1
  case "$pid" in *[!0-9]*|"") return 1 ;; esac
  # Bash wrapper PID is tracked, not an unrelated process found by fuzzy grep.
  kill -0 "$pid" 2>/dev/null
}
if [ "$action" = status ]; then
  if running; then echo "$service: running (pid $pid)"; else echo "$service: stopped or unmanaged"; fi
  exit 0
fi
if [ "$action" = stop ]; then
  if running; then
    kill "$pid" 2>/dev/null || true
    # Do not use kill -9 / process-group kills: service may own child processes.
    echo "$service: stop signal sent; check children and logs"
  else
    echo "$service: not managed by this controller"
  fi
  exit 0
fi
if running; then echo "$service: already running"; exit 0; fi
[ -n "$script" ] && [ -f "$script" ] || {
  echo "Missing start script for $service; no changes made" >&2
  exit 1
}
# Require executable shell scripts supplied/installed by the user. Never eval
# configuration strings or run arbitrary command fragments from env variables.
case "$script" in /*) ;; *) echo "Start script must be absolute" >&2; exit 2 ;; esac
[ -x "$script" ] || { echo "Not executable: $script" >&2; exit 1; }
# This is an on-demand runner, not a watchdog. If the script itself daemonizes,
# its lifecycle must be controlled by that project's own stop command.
nohup "$script" >> "$log" 2>&1 < /dev/null &
echo "$!" > "$pidfile"
sleep 1
if running; then
  echo "$service: started wrapper pid $(cat "$pidfile"); verify readiness separately"
else
  echo "$service: launcher exited; review $log (may have daemonized)" >&2
  exit 1
fi

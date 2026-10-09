#!/data/data/com.termux/files/usr/bin/bash
# Optional local FastBrain control. No package installation or wake lock.
# Hindsight Lite is a Hermes memory provider (see install-hindsight-lite.sh).
set -euo pipefail
[ "$#" = 2 ] || { echo "Usage: $0 {status|start|stop} {fastbrain-router|fastbrain-minilm}" >&2; exit 2; }
action=$1 service=$2
case "$action" in start|stop|status) ;; *) exit 2 ;; esac
FB_HOME="${FASTBRAIN_HOME:-$HOME/.fastbrain}"
case "$service" in
  fastbrain-router)
    script="$HOME/FastBrain/scripts/start-fastbrain-router.sh"
    pidfile="$FB_HOME/router/router.pid"
    socket="$FB_HOME/router/router.sock"
    ;;
  fastbrain-minilm)
    script="$HOME/FastBrain/scripts/start-minilm.sh"
    pidfile="$FB_HOME/minilm/minilm.pid"
    socket="$FB_HOME/minilm/minilm.sock"
    ;;
  *) echo "Unknown service: $service" >&2; exit 2 ;;
esac
read_pid() {
  [ -f "$pidfile" ] || return 1
  IFS= read -r pid < "$pidfile" || return 1
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null
}
case "$action" in
 status)
   if read_pid && [ -S "$socket" ]; then
     echo "$service: running pid=$pid (socket exists; readiness not verified)"
   else
     echo "$service: stopped or unhealthy"
   fi
   ;;
 start)
   if read_pid && [ -S "$socket" ]; then echo "$service: already running"; exit 0; fi
   [ -f "$script" ] || { echo "Missing $script — install FastBrain first" >&2; exit 1; }
   bash "$script"
   if read_pid && [ -S "$socket" ]; then echo "$service: process and socket present"; else exit 1; fi
   ;;
 stop)
   if ! read_pid; then echo "$service: not running"; exit 0; fi
   # Stop only the exact PID FastBrain wrote. No broad pkill or kill -9.
   kill "$pid"
   echo "$service: SIGTERM sent to pid=$pid"
   ;;
esac

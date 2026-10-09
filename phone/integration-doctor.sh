#!/data/data/com.termux/files/usr/bin/bash
# Read-only preflight for optional Hindsight Lite and FastBrain integration.
# Run in Termux, not Debian. No installs, service restarts or wake locks.
set -u

printf '%s\n' '=== Hermes Mobile integration preflight ==='
if command -v proot-distro >/dev/null 2>&1; then
  if [ -d "${PREFIX:-/data/data/com.termux/files/usr}/var/lib/proot-distro/containers/debian/rootfs" ]; then
    echo 'Debian: installed'
  else
    echo 'Debian: absent'
  fi
else
  echo 'proot-distro: unavailable'
fi
if curl --max-time 2 -fsS -o /dev/null http://127.0.0.1:9119/; then
  echo 'Hermes dashboard: reachable'
else
  echo 'Hermes dashboard: not reachable'
fi
if [ -d "$HOME/FastBrain" ]; then
  echo 'FastBrain sources: found'
  for p in "$HOME/FastBrain/scripts/start-minilm.sh" "$HOME/FastBrain/scripts/start-fastbrain-router.sh"; do
    [ ! -f "$p" ] || echo "  Found: ${p#$HOME/}"
  done
else
  echo 'FastBrain sources: not installed'
fi
if [ -d "$HOME/.hindsight-lite" ] || [ -d "$HOME/hindsight-lite" ]; then
  echo 'Hindsight Lite directory: found (installation not verified)'
else
  echo 'Hindsight Lite directory: not found in common locations'
fi
# Hindsight endpoint was previously configured on 20128, which can also be used
# by unrelated routers. Never identify the service solely by an open port.
if curl --max-time 2 -fsS -o /dev/null http://127.0.0.1:20128/; then
  echo 'Port 20128: responds (service identity unknown)'
fi
echo 'Preflight complete. No changes made.'

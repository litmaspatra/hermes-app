#!/data/data/com.termux/files/usr/bin/bash
# Explicit, opt-in installer for the user's Hindsight Lite memory provider.
# Hermes Mobile runs Hermes in Debian (proot), not Termux's Python runtime.
set -euo pipefail
[ "${1:-}" = "--install" ] || {
  echo "Preview only. To install after reviewing source: bash $0 --install"
  echo "Source: https://github.com/litmaspatra/Hindsight-lite-termux"
  echo "Target: Debian Hermes venv and /root/.hermes memory-provider configuration"
  exit 0
}
command -v proot-distro >/dev/null || { echo "proot-distro unavailable" >&2; exit 1; }
proot-distro login debian -- bash -lc '
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
[ -d /root/.hermes ] || { echo "Hermes is missing inside Debian" >&2; exit 1; }
command -v git >/dev/null || { echo "Debian git missing" >&2; exit 1; }
repo=/root/hindsight-lite-mobile
if [ -e "$repo" ]; then
  echo "Existing source checkout $repo; refusing to overwrite it." >&2
  exit 1
fi
# Clone independently: source is platform-neutral Python; Termux wheel is
# intentionally NOT installed in Debian.
git clone --depth 1 https://github.com/litmaspatra/Hindsight-lite-termux.git "$repo"
venv=""
for p in /root/.hermes/installs/*/environments/*/venv/bin/python /root/.hermes/hermes-agent/venv/bin/python; do
  if [ -x "$p" ]; then venv="${p%/bin/python}"; break; fi
done
[ -n "$venv" ] || { echo "Hermes venv not found. No provider installed." >&2; exit 1; }
echo "Found Hermes Python: $venv/bin/python"
# This installer backs up config.yaml, stages/import-checks code, and rolls
# back package replacement on failure. Review upstream first.
cd "$repo"
HERMES_HOME=/root/.hermes HERMES_VENV="$venv" bash install-termux.sh
'

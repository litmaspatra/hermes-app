#!/data/data/com.termux/files/usr/bin/bash
# One-step phone setup, run in TERMUX (not inside Debian) from the cloned repo:
#   bash ~/hermes-mobile/phone/install.sh
# It lets the app start Hermes, installs the Hermes Mobile plugin into Debian and the supervisor script into ~/bin.
# Safe to run again (it just refreshes the files).
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
ROOT="$PREFIX/var/lib/proot-distro/containers/debian/rootfs/root"
die() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$ROOT" ] || die "Debian is not installed in Termux yet. Run: pkg install proot-distro && proot-distro install debian"
[ -d "$ROOT/.hermes" ] || die "Hermes is not set up in Debian yet. Install Hermes Agent and run 'hermes setup' first (see the README)."

echo "1/4 Letting the app start Hermes (allow-external-apps)"
mkdir -p "$HOME/.termux"
grep -qE '^[[:space:]]*allow-external-apps[[:space:]]*=[[:space:]]*true' "$HOME/.termux/termux.properties" 2>/dev/null \
  || echo "allow-external-apps = true" >> "$HOME/.termux/termux.properties"
command -v termux-reload-settings >/dev/null && termux-reload-settings || true

echo "2/4 Installing the supervisor script (~/bin/hermes-services)"
mkdir -p "$HOME/bin"
cp "$here/phone/hermes-services" "$HOME/bin/hermes-services"
chmod +x "$HOME/bin/hermes-services"

echo "3/4 Installing the Hermes Mobile plugin"
mkdir -p "$ROOT/.hermes/plugins" "$ROOT/.hermes/scripts"
rm -rf "$ROOT/.hermes/plugins/hermes-mobile"
cp -r "$here/hermes-plugin/hermes-mobile" "$ROOT/.hermes/plugins/hermes-mobile"
find "$ROOT/.hermes/plugins/hermes-mobile" -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
cp "$here/phone/cron_ticker.py" "$ROOT/.hermes/scripts/cron_ticker.py"

echo "4/4 Enabling the plugin in Hermes"
if proot-distro login debian -- hermes plugins enable hermes-mobile; then :; else
  echo "Could not enable it automatically. Run inside Debian:  hermes plugins enable hermes-mobile"
fi

echo
echo "Done. Next: install the app on your phone (see the README, 'Install the app'), open it and allow the permissions."

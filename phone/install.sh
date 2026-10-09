#!/data/data/com.termux/files/usr/bin/bash
# One-step phone setup. Run it in TERMUX (not inside Debian):
#   curl -fsSL https://raw.githubusercontent.com/omarqaterge/hermes-mobile-app/main/phone/install.sh | bash
# or, from a clone:  bash ~/hermes-mobile/phone/install.sh
# It lets the app start Hermes, installs the Hermes Mobile plugin into Debian and the supervisor script into ~/bin,
# then downloads the app and opens Android's installer. Safe to run again (it just refreshes everything).
set -e
REPO="${HM_MOBILE_REPO:-https://github.com/omarqaterge/hermes-mobile-app}"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
ROOT="$PREFIX/var/lib/proot-distro/containers/debian/rootfs/root"
die() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$ROOT" ] || die "Debian is not installed in Termux yet. Run: pkg install -y proot-distro && proot-distro install debian"
[ -d "$ROOT/.hermes" ] || die "Hermes is not set up in Debian yet. Install Hermes Agent and run 'hermes setup' first (see the README)."

# Run from a clone, or (piped through curl) clone/update ~/hermes-mobile first.
here=""
[ -f "${BASH_SOURCE[0]:-}" ] && here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "$here" ] || [ ! -d "$here/hermes-plugin/hermes-mobile" ]; then
  echo "0/5 Getting Hermes Mobile into ~/hermes-mobile"
  command -v git >/dev/null || pkg install -y git
  if [ -d "$HOME/hermes-mobile/.git" ]; then
    origin=$(git -C "$HOME/hermes-mobile" remote get-url origin)
    case "$origin" in "$REPO"|"$REPO.git") ;; *)
      die "Existing ~/hermes-mobile comes from $origin; refusing to overwrite or change its origin. Use a clean clone or matching HM_MOBILE_REPO."
      ;; esac
    if [ -n "${HM_MOBILE_REF:-}" ]; then
      git -C "$HOME/hermes-mobile" fetch -q --depth 1 origin "$HM_MOBILE_REF"
      git -C "$HOME/hermes-mobile" checkout -q --detach FETCH_HEAD
    else
      git -C "$HOME/hermes-mobile" pull -q --ff-only
    fi
  else
    if [ -n "${HM_MOBILE_REF:-}" ]; then
      git clone -q --depth 1 --branch "$HM_MOBILE_REF" "$REPO.git" "$HOME/hermes-mobile"
    else
      git clone -q --depth 1 "$REPO.git" "$HOME/hermes-mobile"
    fi
  fi
  here="$HOME/hermes-mobile"
fi

echo "1/5 Letting the app start Hermes (allow-external-apps)"
mkdir -p "$HOME/.termux"
grep -qE '^[[:space:]]*allow-external-apps[[:space:]]*=[[:space:]]*true' "$HOME/.termux/termux.properties" 2>/dev/null \
  || echo "allow-external-apps = true" >> "$HOME/.termux/termux.properties"
command -v termux-reload-settings >/dev/null && termux-reload-settings || true

echo "2/5 Installing the supervisor script (~/bin/hermes-services)"
mkdir -p "$HOME/bin"
cp "$here/phone/hermes-services" "$HOME/bin/hermes-services"
chmod +x "$HOME/bin/hermes-services"

# Optional Termux command: delegates to Debian and never replaces a different CLI.
if [ -f "$here/phone/install-hermes-command.sh" ]; then
  if ! bash "$here/phone/install-hermes-command.sh"; then
    echo "Skipped Termux hermes shortcut; Hermes Mobile setup can continue."
  fi
fi

echo "3/5 Installing the Hermes Mobile plugin"
mkdir -p "$ROOT/.hermes/plugins" "$ROOT/.hermes/scripts"
rm -rf "$ROOT/.hermes/plugins/hermes-mobile"
cp -r "$here/hermes-plugin/hermes-mobile" "$ROOT/.hermes/plugins/hermes-mobile"
find "$ROOT/.hermes/plugins/hermes-mobile" -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
cp "$here/phone/cron_ticker.py" "$ROOT/.hermes/scripts/cron_ticker.py"

echo "4/5 Enabling the plugin in Hermes"
if proot-distro login debian -- bash -lc 'PATH="$HOME/.local/bin:$PATH" hermes plugins enable hermes-mobile'; then :; else
  echo "Could not enable it automatically. Run inside Debian:  hermes plugins enable hermes-mobile"
fi

# Hermes' google-workspace skill (Gmail/Calendar/Drive) is often run with Debian's system python3, which lacks these.
echo "    Adding the Google client libraries for Hermes' Google skill (optional)"
proot-distro login debian -- bash -lc 'apt-get install -y python3-googleapi python3-google-auth-oauthlib python3-google-auth-httplib2' >/dev/null 2>&1 \
  || echo "    Skipped (not needed unless you use Hermes with Google Calendar/Gmail)."

if [ -n "${HM_NO_APK:-}" ]; then echo "Done (app download skipped: HM_NO_APK is set)."; exit 0; fi
echo "5/5 Downloading the app"
apk="$HOME/hermes-mobile.apk"
if curl -fsL -o "$apk" "$REPO/releases/latest/download/hermes-mobile.apk"; then
  echo
  echo "Done. Android's installer opens now: tap Install (allow Termux to install apps if it asks)."
  echo "If nothing opens, run:  termux-open $apk"
  termux-open "$apk" 2>/dev/null || true
else
  rm -f "$apk"
  echo
  echo "Done with the phone side, but no ready-made app was found to download."
  echo "Build it on a computer instead: see 'Build the app yourself' in the README."
fi
echo "Then open Hermes Mobile and allow the permissions it asks for."

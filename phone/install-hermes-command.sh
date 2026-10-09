#!/data/data/com.termux/files/usr/bin/bash
# Install only the Termux -> Debian Hermes CLI shim, no service restart.
set -euo pipefail
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$PREFIX/bin/hermes"
SOURCE="$HERE/hermes"
[ -f "$SOURCE" ] || { echo "Missing $SOURCE" >&2; exit 1; }
[ -d "$PREFIX/bin" ] || { echo "Termux PREFIX invalid: $PREFIX" >&2; exit 1; }
command -v proot-distro >/dev/null || { echo "proot-distro unavailable" >&2; exit 1; }
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  if cmp -s "$SOURCE" "$TARGET"; then
    chmod 700 "$TARGET"
    echo "Already installed: $TARGET"
    exit 0
  fi
  echo "Refusing to replace existing command: $TARGET" >&2
  echo "Inspect or back up the existing command manually before replacing it." >&2
  exit 1
fi
install -m 700 "$SOURCE" "$TARGET"
echo "Installed: $TARGET"
echo "Try: hermes --version"

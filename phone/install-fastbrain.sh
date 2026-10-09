#!/data/data/com.termux/files/usr/bin/bash
# Explicit, standalone FastBrain installation in Termux, outside Hermes/Debian.
set -euo pipefail
source_url=https://github.com/litmaspatra/FastBrain.git
target="$HOME/FastBrain"
if [ "${1:-}" != "--install" ]; then
  echo "Preview: clone $source_url into $target and run its standard Termux installer."
  echo "Run: bash $0 --install  (after inspecting the upstream installer)."
  exit 0
fi
command -v git >/dev/null || { echo "git missing; install it yourself first." >&2; exit 1; }
command -v python3.13 >/dev/null || {
  echo "Python 3.13 is required for this managed install; no changes made." >&2
  exit 1
}
if [ -e "$target" ]; then
  echo "Refusing to overwrite $target. Use FastBrain's own updater." >&2
  exit 1
fi
git clone --depth 1 "$source_url" "$target"
cd "$target"
FASTBRAIN_PYTHON=python3.13 bash scripts/install-termux.sh
FASTBRAIN_PYTHON=python3.13 "$HOME/.fastbrain/fastbrain" doctor
echo "Standalone FastBrain installed; no Hermes routing or auto-start enabled."
echo "MiniLM ONNX setup is separate and NOT installed by this script."

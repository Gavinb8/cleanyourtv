#!/usr/bin/env bash
# Push paddock.config.json, garage.json and prepped photos to the box and reload PADDOCK.
# Needs the photos already prepped: tools/paddock-prep-photos.py first.
#
# Usage: TV_HOST=192.168.1.50 tools/paddock-push.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PY=tools/venv/bin/python
[ -x "$PY" ] || PY=tools/venv/Scripts/python.exe
[ -x "$PY" ] || { echo "run: python3 -m venv tools/venv && tools/venv/bin/pip install -r tools/requirements.txt" >&2; exit 1; }
: "${TV_HOST:?set TV_HOST to the TV IP address, e.g. TV_HOST=192.168.1.50 $0}"
export MSYS_NO_PATHCONV=1

PKG=com.gavin.paddock
REMOTE=/sdcard/Android/data/$PKG/files/paddock
tv() { "$PY" -I tools/tv.py "$@"; }

[ -f paddock/paddock.config.json ] || { echo "missing paddock/paddock.config.json" >&2; exit 1; }
[ -f paddock/garage.json ] || { echo "missing paddock/garage.json" >&2; exit 1; }

echo "Pushing config and garage data..."
tv "mkdir -p $REMOTE/photos"
"$PY" -I tools/b64push.py paddock/paddock.config.json "$REMOTE/paddock.config.json"
"$PY" -I tools/b64push.py paddock/garage.json "$REMOTE/garage.json"

PHOTOS_DIR=paddock/assets/photos-prepped
if [ -d "$PHOTOS_DIR" ]; then
  echo "Pushing prepped photos from $PHOTOS_DIR..."
  for f in "$PHOTOS_DIR"/*.jpg; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    echo "  $name"
    "$PY" -I tools/b64push.py "$f" "$REMOTE/photos/$name"
  done
else
  echo "No $PHOTOS_DIR folder - run tools/paddock-prep-photos.py first if you have new photos to push." >&2
fi

echo "Reloading PADDOCK..."
tv "am force-stop $PKG"
tv "input keyevent KEYCODE_HOME"
echo "Done. PADDOCK should come back up with the new data in a couple of seconds."

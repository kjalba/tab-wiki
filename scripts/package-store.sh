#!/usr/bin/env bash
# Builds store-submission packages into extension/dist/store/:
#   tab-wiki-chromium-store.zip  - for Chrome Web Store
#   tab-wiki-firefox-store.zip   - for addons.mozilla.org (AMO)
#
# Chrome Web Store notes:
# - The store REJECTS manifests containing a "key" field, so it is stripped.
# - To keep our stable extension ID (dekbipliihgnonlenepdooagogfibkgo), the
#   private key (extension/chromium-key.pem) is included as key.pem in the zip
#   for the FIRST upload only; the store derives the same ID from it.
#   If the store still assigns a different ID, users can rerun the installer
#   with that ID as an argument - nothing else breaks.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR/extension"

echo "==> Building extension"
npm run build >/dev/null

OUT="dist/store"
rm -rf "$OUT" && mkdir -p "$OUT/chromium"

echo "==> Chromium store package (key stripped, key.pem included)"
cp -R dist/chromium/. "$OUT/chromium/"
python3 - "$OUT/chromium/manifest.json" <<'PYEOF'
import json, sys
p = sys.argv[1]
m = json.load(open(p))
m.pop("key", None)
json.dump(m, open(p, "w"), indent=2)
PYEOF
if [ -f chromium-key.pem ]; then
  cp chromium-key.pem "$OUT/chromium/key.pem"
else
  echo "    WARNING: chromium-key.pem missing - store will assign a fresh ID"
fi
(cd "$OUT/chromium" && zip -qr ../tab-wiki-chromium-store.zip .)
rm -rf "$OUT/chromium"

echo "==> Firefox AMO package"
(cd dist/firefox && zip -qr "../store/tab-wiki-firefox-store.zip" .)

echo "==> Done:"
ls -la "$OUT"

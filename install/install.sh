#!/usr/bin/env bash
# tab-wiki installer (macOS).
# Builds the Companion and registers it as a native messaging host for
# Firefox-family (Zen, Firefox) and Chromium-family (Helium, Chromium, Chrome).
#
# Usage:
#   ./install.sh                      # Firefox-family manifests only
#   ./install.sh <chromium-ext-id>    # also Chromium-family (pass the ID shown
#                                     # on the browser's extensions page after
#                                     # loading the unpacked extension)
set -euo pipefail

HOST_NAME="com.kjalba.tabwiki"
FIREFOX_EXT_ID="tabwiki@kjalba.dev"
CHROMIUM_EXT_ID="${1:-}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
BIN_PATH="$BIN_DIR/tab-wiki-companion"

echo "==> Building Companion"
mkdir -p "$BIN_DIR"
(cd "$REPO_DIR/companion" && go build -o "$BIN_PATH" .)
echo "    installed $BIN_PATH"

if [ -d "$REPO_DIR/extension/node_modules" ]; then
  echo "==> Building extension bundle"
  (cd "$REPO_DIR/extension" && npm run build >/dev/null)
  echo "    built extension/dist/{firefox,chromium}"
else
  echo "==> Skipping extension build (run 'cd extension && npm install' first)"
fi

APP_SUPPORT="$HOME/Library/Application Support"

firefox_dirs=(
  "$APP_SUPPORT/Mozilla/NativeMessagingHosts"
  "$APP_SUPPORT/zen/NativeMessagingHosts"
)
chromium_dirs=(
  "$APP_SUPPORT/Chromium/NativeMessagingHosts"
  "$APP_SUPPORT/Helium/NativeMessagingHosts"
  "$APP_SUPPORT/Google/Chrome/NativeMessagingHosts"
)

echo "==> Writing Firefox-family native messaging manifests"
for dir in "${firefox_dirs[@]}"; do
  mkdir -p "$dir"
  cat > "$dir/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "tab-wiki Companion",
  "path": "$BIN_PATH",
  "type": "stdio",
  "allowed_extensions": ["$FIREFOX_EXT_ID"]
}
EOF
  echo "    $dir/$HOST_NAME.json"
done

if [ -n "$CHROMIUM_EXT_ID" ]; then
  echo "==> Writing Chromium-family native messaging manifests"
  for dir in "${chromium_dirs[@]}"; do
    mkdir -p "$dir"
    cat > "$dir/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "tab-wiki Companion",
  "path": "$BIN_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$CHROMIUM_EXT_ID/"]
}
EOF
    echo "    $dir/$HOST_NAME.json"
  done
else
  echo "==> Skipping Chromium-family manifests (no extension ID given)."
  echo "    After loading the unpacked extension in Helium, rerun:"
  echo "    ./install.sh <extension-id>"
fi

if [ -d "$REPO_DIR/extension/dist/firefox" ]; then
  echo "==> Packaging .xpi for permanent Firefox-family install"
  (cd "$REPO_DIR/extension/dist/firefox" && rm -f ../tab-wiki.xpi && zip -qr ../tab-wiki.xpi .)
  echo "    extension/dist/tab-wiki.xpi"
fi

echo "==> Done. Load the extension in your browser (see README):"
echo "    Zen temporary:  about:debugging > Load Temporary Add-on > extension/dist/firefox/manifest.json"
echo "    Zen permanent:  about:config xpinstall.signatures.required=false,"
echo "                    then about:addons > gear > Install Add-on From File > extension/dist/tab-wiki.xpi"
echo "    Helium/Chrome:  chrome://extensions > Developer mode > Load unpacked > extension/dist/chromium/"
echo "                    then rerun this script with the extension ID it shows"

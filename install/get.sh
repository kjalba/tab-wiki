#!/usr/bin/env bash
# tab-wiki end-user installer: no Go or Node required.
# Downloads the latest Companion binary from GitHub Releases and registers it
# as a native messaging host for Firefox- and Chromium-family browsers.
#
#   curl -fsSL https://raw.githubusercontent.com/kjalba/tab-wiki/main/install/get.sh | bash
#   ... | bash -s -- <chromium-extension-id>     # only if your ID differs
set -euo pipefail

REPO="kjalba/tab-wiki"
HOST_NAME="com.kjalba.tabwiki"
FIREFOX_EXT_ID="tabwiki@kjalba.dev"
CHROMIUM_EXT_ID="${1:-dekbipliihgnonlenepdooagogfibkgo}"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac
case "$OS" in
  darwin | linux) ;;
  *) echo "Unsupported OS: $OS (macOS and Linux only for now)" >&2; exit 1 ;;
esac

BIN_DIR="$HOME/.local/bin"
BIN_PATH="$BIN_DIR/tab-wiki-companion"
ASSET="tab-wiki-companion-$OS-$ARCH"

echo "==> Downloading latest Companion ($ASSET)"
mkdir -p "$BIN_DIR"
TMP_BIN=$(mktemp)
curl -fsSL "https://github.com/$REPO/releases/latest/download/$ASSET" -o "$TMP_BIN"
chmod +x "$TMP_BIN"
if [ "$OS" = "darwin" ]; then
  # Cross-compiled Go binaries can arrive with a signature the Apple Silicon
  # kernel rejects (SIGKILL on launch); an ad-hoc re-sign always validates.
  # The mv (new inode) also avoids the kernel's stale-signature cache when
  # replacing an existing binary in place.
  codesign --force -s - "$TMP_BIN" 2>/dev/null || true
fi
mv -f "$TMP_BIN" "$BIN_PATH"
echo "    installed $BIN_PATH"

if [ "$OS" = "darwin" ]; then
  APP_SUPPORT="$HOME/Library/Application Support"
  firefox_dirs=(
    "$APP_SUPPORT/Mozilla/NativeMessagingHosts"
    "$APP_SUPPORT/zen/NativeMessagingHosts"
  )
  chromium_dirs=(
    "$APP_SUPPORT/Chromium/NativeMessagingHosts"
    "$APP_SUPPORT/net.imput.helium/NativeMessagingHosts"
    "$APP_SUPPORT/Google/Chrome/NativeMessagingHosts"
    "$APP_SUPPORT/Arc/User Data/NativeMessagingHosts"
  )
else
  firefox_dirs=(
    "$HOME/.mozilla/native-messaging-hosts"
    "$HOME/.zen/native-messaging-hosts"
  )
  chromium_dirs=(
    "$HOME/.config/chromium/NativeMessagingHosts"
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/net.imput.helium/NativeMessagingHosts"
  )
fi

echo "==> Registering native messaging host (Firefox-family)"
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

echo "==> Registering native messaging host (Chromium-family, extension id: $CHROMIUM_EXT_ID)"
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

echo "==> Done. Install the browser extension next (see the README), then click"
echo "    the Tab Wiki toolbar icon - it should show 'Archive: ~/tab-wiki'."

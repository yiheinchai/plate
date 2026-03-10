#!/bin/bash
set -euo pipefail

# ─── Local Build & Release Script ───
# Replaces GitHub Actions for building, signing, and releasing Plate.
# Usage: ./scripts/release.sh [version]
#   e.g. ./scripts/release.sh 0.6.0
# If no version is given, reads from src-tauri/tauri.conf.json.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ─── Resolve version ───
if [ -n "${1:-}" ]; then
  VERSION="$1"
else
  VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
fi
TAG="v${VERSION}"
echo "==> Building Plate ${TAG}"

# ─── Check prerequisites ───
command -v gh >/dev/null 2>&1 || { echo "ERROR: gh (GitHub CLI) not found. Install with: brew install gh"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "ERROR: cargo not found"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm not found"; exit 1; }

SIGNING_KEY="$HOME/.tauri/plate.key"
if [ ! -f "$SIGNING_KEY" ]; then
  echo "ERROR: Signing key not found at $SIGNING_KEY"
  echo "Generate one with: npx @tauri-apps/cli signer generate --ci"
  exit 1
fi

# ─── Bump version in all files ───
echo "==> Setting version to ${VERSION}"
cd "$REPO_ROOT"

# package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" package.json

# tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

# Cargo.toml (only the first occurrence under [package])
sed -i '' "0,/^version = \".*\"/s//version = \"${VERSION}\"/" src-tauri/Cargo.toml

# ─── Install frontend deps ───
echo "==> Installing frontend dependencies"
npm ci --silent

# ─── Build ───
echo "==> Building Tauri app (this may take a few minutes)..."
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$SIGNING_KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
export MACOSX_DEPLOYMENT_TARGET="13.0"
export CMAKE_OSX_DEPLOYMENT_TARGET="13.0"

npx tauri build 2>&1 | tail -5

# ─── Locate artifacts ───
BUNDLE_DIR="src-tauri/target/release/bundle"
DMG=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" 2>/dev/null | head -1)
APP_TAR=$(find "$BUNDLE_DIR/macos" -name "*.tar.gz" ! -name "*.sig" 2>/dev/null | head -1)
APP_SIG=$(find "$BUNDLE_DIR/macos" -name "*.tar.gz.sig" 2>/dev/null | head -1)

if [ -z "$DMG" ] || [ -z "$APP_TAR" ] || [ -z "$APP_SIG" ]; then
  echo "ERROR: Build artifacts not found!"
  echo "  DMG: ${DMG:-MISSING}"
  echo "  TAR: ${APP_TAR:-MISSING}"
  echo "  SIG: ${APP_SIG:-MISSING}"
  echo ""
  echo "Listing bundle dir:"
  find "$BUNDLE_DIR" -type f 2>/dev/null
  exit 1
fi

echo "==> Build artifacts:"
echo "  DMG: $DMG"
echo "  TAR: $APP_TAR"
echo "  SIG: $APP_SIG"

# ─── Read signature for latest.json ───
SIGNATURE=$(cat "$APP_SIG")

# ─── Generate latest.json ───
RELEASE_URL="https://github.com/yiheinchai/plate/releases/download/${TAG}/Plate_aarch64.app.tar.gz"
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

cat > /tmp/plate-latest.json << EOJSON
{
  "version": "${VERSION}",
  "notes": "Plate ${TAG}",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-aarch64": {
      "signature": "${SIGNATURE}",
      "url": "${RELEASE_URL}"
    },
    "darwin-aarch64-app": {
      "signature": "${SIGNATURE}",
      "url": "${RELEASE_URL}"
    }
  }
}
EOJSON

echo "==> Generated latest.json"

# ─── Rename artifacts to match expected names ───
STAGED_DIR="/tmp/plate-release-${VERSION}"
rm -rf "$STAGED_DIR"
mkdir -p "$STAGED_DIR"

cp "$DMG" "$STAGED_DIR/Plate_${VERSION}_aarch64.dmg"
cp "$APP_TAR" "$STAGED_DIR/Plate_aarch64.app.tar.gz"
cp "$APP_SIG" "$STAGED_DIR/Plate_aarch64.app.tar.gz.sig"
cp /tmp/plate-latest.json "$STAGED_DIR/latest.json"

echo "==> Staged release files:"
ls -lh "$STAGED_DIR/"

# ─── Create GitHub Release ───
echo "==> Creating GitHub release ${TAG}..."

RELEASE_NOTES="Download **Plate.dmg** below and drag to Applications.

> Requires macOS 13+ on Apple Silicon (M1/M2/M3/M4).

**Important:** The app is not code-signed, so macOS will say it's \"damaged\". After installing, run this once in Terminal:
\`\`\`
xattr -cr /Applications/Plate.app
\`\`\`
Then open normally."

# Delete existing release/tag if present (for re-releases)
gh release delete "$TAG" --yes 2>/dev/null || true
git tag -d "$TAG" 2>/dev/null || true
git push origin ":refs/tags/$TAG" 2>/dev/null || true

# Create tag and release
git tag "$TAG"
git push origin "$TAG"

gh release create "$TAG" \
  "$STAGED_DIR/Plate_${VERSION}_aarch64.dmg" \
  "$STAGED_DIR/Plate_aarch64.app.tar.gz" \
  "$STAGED_DIR/Plate_aarch64.app.tar.gz.sig" \
  "$STAGED_DIR/latest.json" \
  --title "Plate ${TAG}" \
  --notes "$RELEASE_NOTES"

# ─── Cleanup ───
rm -rf "$STAGED_DIR" /tmp/plate-latest.json

echo ""
echo "==> Release ${TAG} published!"
echo "    https://github.com/yiheinchai/plate/releases/tag/${TAG}"

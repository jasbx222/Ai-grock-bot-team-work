#!/usr/bin/env bash
# Build the web office and copy it into the Flutter assets.
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run build
rm -rf flutter_app/assets/web
mkdir -p flutter_app/assets/web
cp -r dist/. flutter_app/assets/web/
echo "web build copied to flutter_app/assets/web"

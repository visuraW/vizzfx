#!/usr/bin/env bash
# Package plugin/ into dist/VizzFX.ccx (a .ccx is a zip with manifest.json at its root).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/VizzFX.ccx
(cd plugin && zip -qr ../dist/VizzFX.ccx manifest.json index.html index.js styles.css icons luts mogrt)
echo "Built dist/VizzFX.ccx"

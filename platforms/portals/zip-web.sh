#!/usr/bin/env bash
# Packages the built web game (dist/) as a zip for HTML5 portals: itch.io, galaxy.click upload,
# CrazyGames, Newgrounds... index.html sits at the zip root, as they require.
#   npm run build && platforms/portals/zip-web.sh            -> platforms/portals/out/bioluma-web-<version>.zip
# The service worker is left out: inside a portal iframe it would cache files on the portal's
# CDN origin (platform.shouldRegisterServiceWorker() also skips it once integrated).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
dist="${BIOLUMA_WEB_DIR:-$root/dist}"
version="${BIOLUMA_VERSION:-$(node -p "require('$root/package.json').version")}"
out="$here/out"
[[ -f "$dist/index.html" ]] || { echo "no $dist/index.html: run 'npm run build' first" >&2; exit 1; }
mkdir -p "$out"
zip_file="$out/bioluma-web-$version.zip"
rm -f "$zip_file"
(cd "$dist" && zip -qr -X "$zip_file" . -x 'sw.js' -x '*.map')
size=$(du -k "$zip_file" | cut -f1)
echo "$zip_file (${size} KB)"
# itch.io HTML5 limits: 500 MB total, 1000 files; CrazyGames: initial download <= 50 MB.

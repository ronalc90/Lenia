#!/usr/bin/env bash
# Pushes Bioluma to itch.io with butler (https://itch.io/docs/butler/). Channels:
#   html5   <- platforms/portals/out/bioluma-web-<version>.zip   (run zip-web.sh first)
#   windows <- platforms/desktop/release/win-unpacked             (if built)
#   linux   <- platforms/desktop/release/linux-unpacked           (if built)
#   mac     <- platforms/desktop/release/mac-universal            (if built)
#
#   BUTLER_API_KEY=... ITCH_TARGET=youruser/bioluma platforms/portals/itch-push.sh
# Locally you can instead run `butler login` once and omit BUTLER_API_KEY.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
: "${ITCH_TARGET:?set ITCH_TARGET=user/game (the itch.io project)}"
BUTLER="${BUTLER:-butler}"
version="${BIOLUMA_VERSION:-$(node -p "require('$root/package.json').version")}"
release="$root/platforms/desktop/release"
pushed=0

push() { # path channel
  echo "butler push $1 -> $ITCH_TARGET:$2 ($version)"
  "$BUTLER" push "$1" "$ITCH_TARGET:$2" --userversion "$version"
  pushed=$((pushed + 1))
}

web_zip="$here/out/bioluma-web-$version.zip"
[[ -f "$web_zip" ]] && push "$web_zip" html5
[[ -d "$release/win-unpacked" ]] && push "$release/win-unpacked" windows
[[ -d "$release/linux-unpacked" ]] && push "$release/linux-unpacked" linux
[[ -d "$release/mac-universal" ]] && push "$release/mac-universal" mac
(( pushed > 0 )) || { echo "nothing to push: run zip-web.sh and/or the desktop build first" >&2; exit 1; }

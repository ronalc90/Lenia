#!/usr/bin/env bash
# Uploads the Steam build with SteamPipe (steamcmd). Run on the machine that holds the Steam
# builder account (Steam Guard), after building the depots:
#
#   cd platforms/desktop && STEAM_APP_ID=1234560 npm run dist:steam -- --win --linux   # (--mac on a Mac)
#   STEAM_APP_ID=1234560 STEAM_DEPOT_WIN=1234561 STEAM_DEPOT_MAC=1234562 STEAM_DEPOT_LINUX=1234563 \
#   STEAM_BUILDER_USER=my_builder_account [STEAM_SET_LIVE=beta] [STEAM_PREVIEW=1] \
#     platforms/steam/scripts/upload.sh
#
# Depots whose folder is missing (e.g. no Mac build yet) are skipped. Nothing here is secret: the
# password is typed into steamcmd (cached afterwards); never put it in the repo or CI logs.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
steam="$(dirname "$here")"
root="$(cd "$steam/../.." && pwd)"
tpl="$steam/steampipe"
out="$tpl/out"
release="$root/platforms/desktop/release-steam"

: "${STEAM_APP_ID:?set STEAM_APP_ID (Steamworks App ID)}"
: "${STEAM_BUILDER_USER:?set STEAM_BUILDER_USER (a Steam account with build rights, ideally builder-only)}"
STEAM_SET_LIVE="${STEAM_SET_LIVE:-}"
STEAM_PREVIEW="${STEAM_PREVIEW:-0}"
STEAMCMD="${STEAMCMD:-steamcmd}"
version="${BIOLUMA_VERSION:-$(node -p "require('$root/package.json').version")}"

mkdir -p "$out" "$steam/build-logs"
rm -f "$out"/*.vdf

render() { # template -> output
  sed -e "s/__APP_ID__/$STEAM_APP_ID/g" -e "s/__VERSION__/$version/g" \
      -e "s/__SET_LIVE__/$STEAM_SET_LIVE/g" -e "s/__PREVIEW__/$STEAM_PREVIEW/g" \
      -e "s/__DEPOT_WIN__/${STEAM_DEPOT_WIN:-0}/g" -e "s/__DEPOT_MAC__/${STEAM_DEPOT_MAC:-0}/g" \
      -e "s/__DEPOT_LINUX__/${STEAM_DEPOT_LINUX:-0}/g" "$1" > "$2"
}

app_vdf="$out/app_build_$STEAM_APP_ID.vdf"
render "$tpl/app_build_APPID.vdf" "$app_vdf"
depots=0
for os in win mac linux; do
  var="STEAM_DEPOT_$(echo "$os" | tr '[:lower:]' '[:upper:]')"
  id="${!var:-}"
  case "$os" in win) dir="win-unpacked" ;; mac) dir="mac-universal" ;; linux) dir="linux-unpacked" ;; esac
  if [[ -n "$id" && -d "$release/$dir" ]]; then
    render "$tpl/depot_build_$os.vdf" "$out/depot_build_$id.vdf"
    depots=$((depots + 1))
    echo "depot $os ($id): $release/$dir"
  else
    # Drop the depot line from the app build (no id or no build for this OS).
    sed -i.bak "/depot_build_${id:-0}\.vdf/d" "$app_vdf" && rm -f "$app_vdf.bak"
    echo "skip $os (${id:-no depot id}, ${dir} missing or not requested)"
  fi
done
(( depots > 0 )) || { echo "no depot to upload: build with 'npm run dist:steam' first" >&2; exit 1; }

echo "uploading Bioluma $version to app $STEAM_APP_ID (set live: ${STEAM_SET_LIVE:-none}, preview: $STEAM_PREVIEW)"
"$STEAMCMD" +login "$STEAM_BUILDER_USER" +run_app_build "$app_vdf" +quit

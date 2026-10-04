// @ts-check
/**
 * Steam build: same app as electron-builder.config.cjs plus steamworks.js, packaged as plain folders
 * (Steam installs and updates files itself; no installer, no auto-updater). Output, one folder per
 * depot: release/win-unpacked, release/mac-universal/Bioluma.app (or mac/), release/linux-unpacked.
 *
 *   STEAM_APP_ID=1234560 npm run dist:steam -- --win --linux --mac
 *   then upload with platforms/steam/scripts/upload.sh (SteamPipe).
 *
 * Without STEAM_APP_ID the build refuses to run (a Steam build without an app id is a mistake).
 * Without the Steam client the game still runs (no achievements); STEAM_RELAUNCH=1 changes that.
 */
const base = require('./electron-builder.config.cjs');

const appId = Number(process.env.STEAM_APP_ID);
if (!Number.isInteger(appId) || appId <= 0) {
  throw new Error('Set STEAM_APP_ID (your Steamworks App ID) to build the Steam version.');
}

/** @type {import('electron-builder').Configuration} */
const config = {
  ...base,
  extraMetadata: {
    ...base.extraMetadata,
    // steamRelaunch: STEAM_RELAUNCH=1 makes a copy started outside Steam quit and relaunch via Steam.
    bioluma: { store: 'steam', steamAppId: appId, steamRelaunch: process.env.STEAM_RELAUNCH === '1' },
  },
  files: (base.files || []).filter((f) => f !== '!node_modules/steamworks.js/**'),
  // Native module and Steam API libraries must live outside the asar archive.
  asarUnpack: ['node_modules/steamworks.js/**'],
  directories: { output: 'release-steam', buildResources: 'build' },
  win: {
    ...base.win,
    target: [{ target: 'dir', arch: ['x64'] }],
    // steamworks.js README: ship the Steam API library next to the executable too.
    extraFiles: [{ from: 'node_modules/steamworks.js/dist/win64/steam_api64.dll', to: 'steam_api64.dll' }],
  },
  mac: { ...base.mac, target: [{ target: 'dir', arch: ['universal'] }] },
  linux: {
    ...base.linux,
    target: [{ target: 'dir', arch: ['x64'] }],
    extraFiles: [{ from: 'node_modules/steamworks.js/dist/linux64/libsteam_api.so', to: 'libsteam_api.so' }],
  },
};

module.exports = config;

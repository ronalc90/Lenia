// @ts-check
/**
 * electron-builder config for the standalone desktop builds (itch.io, GitHub Releases, direct download).
 *   Windows: NSIS installer + portable .exe (x64)      npm run dist:win
 *   macOS:   .dmg, universal (Intel + Apple Silicon)   npm run dist:mac   (ad-hoc signed, not notarised)
 *   Linux:   AppImage (x64)                            npm run dist:linux
 * The Steam build extends this file: electron-builder.steam.cjs.
 *
 * Version: BIOLUMA_VERSION (CI sets it from the git tag, "v1.2.3" -> "1.2.3"), else the root package.json.
 * Signing is OFF until secrets exist (see docs/PLATAFORMAS.md):
 *   Windows: set CSC_LINK + CSC_KEY_PASSWORD (or Azure Trusted Signing) -> NSIS/portable get signed.
 *   macOS:   set CSC_LINK + CSC_KEY_PASSWORD + APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID,
 *            change mac.identity to undefined, hardenedRuntime to true and notarize to true.
 */
const fs = require('node:fs');
const path = require('node:path');

const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const version = (process.env.BIOLUMA_VERSION || rootPkg.version).replace(/^v/, '');

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'com.bioluma.game', // reverse-DNS id; change once the domain is bought (keep it stable afterwards)
  productName: 'Bioluma',
  copyright: 'Copyright © 2026 Bioluma contributors. Lenia catalog © 2018 Bert Chan (MIT).',
  extraMetadata: { version, bioluma: { store: 'standalone' } },
  directories: { output: 'release', buildResources: 'build' },
  files: [
    'main.cjs',
    'preload.cjs',
    'steam.cjs',
    'steam-achievements.json',
    'package.json',
    'web/**/*',
    'build/icon.png',
    // Steam-only native module: excluded from standalone builds (the game never needs it there).
    '!node_modules/steamworks.js/**',
    '!node_modules/@types/**',
    '!node_modules/undici-types/**',
  ],
  asar: true,
  electronLanguages: ['en-US', 'es', 'es-419'], // trims ~40 MB of unused Chromium locales
  // Hardening: the binary cannot be abused as a Node runtime and only runs our (integrity-checked) asar.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  publish: null,

  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: 'build/icon.ico',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Bioluma',
    deleteAppDataOnUninstall: false, // keep saves
    artifactName: '${productName}-${version}-win-setup-${arch}.${ext}',
  },
  portable: {
    artifactName: '${productName}-${version}-win-portable-${arch}.${ext}',
  },

  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    icon: 'build/icon.icns',
    category: 'public.app-category.simulation-games',
    identity: '-', // ad-hoc: runs on Apple Silicon after "Open Anyway"; replace with a Developer ID to notarise
    hardenedRuntime: false,
    notarize: false,
    darkModeSupport: true,
    minimumSystemVersion: '12.0',
  },
  dmg: {
    artifactName: '${productName}-${version}-mac-universal.${ext}',
    contents: [
      { x: 140, y: 190, type: 'file' },
      { x: 400, y: 190, type: 'link', path: '/Applications' },
    ],
  },

  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    executableName: 'bioluma',
    icon: 'build/icons',
    category: 'Game',
    synopsis: 'Incremental game grown from live Lenia artificial life',
    description: 'Bioluma: sow matter, discover Lenia species, trigger an extinction and return with better genes.',
    maintainer: 'Bioluma contributors',
    desktop: { entry: { StartupWMClass: 'Bioluma', Keywords: 'game;idle;incremental;lenia;artificial life;' } },
  },
  appImage: {
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
  },
};

module.exports = config;

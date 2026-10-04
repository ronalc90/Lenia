// Applies Bioluma's settings to the Capacitor native projects. Idempotent: safe after every
// `npx cap add` / `npx cap sync`, and in CI where android/ is generated on the fly.
//   node scripts/patch-native.mjs android|ios|all
//
// Android (android/app/build.gradle, AndroidManifest.xml):
//   - versionName = BIOLUMA_VERSION or root package.json version; versionCode = BIOLUMA_VERSION_CODE
//     or major*10000 + minor*100 + patch (monotonic with semver; Play requires it to grow).
//   - release signing from env vars only (never committed): BIOLUMA_KEYSTORE_PATH,
//     BIOLUMA_KEYSTORE_PASSWORD, BIOLUMA_KEY_ALIAS, BIOLUMA_KEY_PASSWORD. Without them the release
//     build stays unsigned (fine for Play App Signing upload keys set up later, or for CI artifacts).
//   - portrait orientation (same as manifest.webmanifest; Android 16 ignores it on large screens).
// iOS (ios/App/App/Info.plist): portrait on iPhone, ITSAppUsesNonExemptEncryption = false (only
//   HTTPS is used), status bar style handled by SystemBars, CFBundleDisplayName = Bioluma.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(readFileSync(join(mobile, '..', '..', 'package.json'), 'utf8'));
const version = (process.env.BIOLUMA_VERSION || rootPkg.version).replace(/^v/, '');
const [maj, min, pat] = version.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
const versionCode = Number(process.env.BIOLUMA_VERSION_CODE) || maj * 10000 + min * 100 + pat || 1;
const target = process.argv[2] || 'all';

function edit(file, fn) {
  if (!existsSync(file)) return false;
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`[patch-native] ${after !== before ? 'patched' : 'ok     '} ${file.slice(mobile.length + 1)}`);
  return true;
}

function android() {
  const gradle = join(mobile, 'android', 'app', 'build.gradle');
  const found = edit(gradle, (s) => {
    s = s.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
    if (!s.includes('BIOLUMA-SIGNING')) {
      s = s.replace(
        /^android \{\n/m,
        `android {
    // BIOLUMA-SIGNING (platforms/mobile/scripts/patch-native.mjs): release key from env vars only.
    signingConfigs {
        release {
            def ks = System.getenv("BIOLUMA_KEYSTORE_PATH")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("BIOLUMA_KEYSTORE_PASSWORD")
                keyAlias System.getenv("BIOLUMA_KEY_ALIAS")
                keyPassword System.getenv("BIOLUMA_KEY_PASSWORD")
            }
        }
    }
`,
      );
      s = s.replace(
        /(buildTypes \{\n\s*release \{\n)/,
        `$1            if (System.getenv("BIOLUMA_KEYSTORE_PATH")) signingConfig signingConfigs.release\n`,
      );
    }
    return s;
  });
  if (!found) {
    console.log('[patch-native] android/ not found: run "npm run add:android" first');
    return;
  }
  edit(join(mobile, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), (s) =>
    s.includes('android:screenOrientation') ? s : s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"'),
  );
}

function plistSet(s, key, valueXml) {
  const re = new RegExp(`<key>${key}</key>\\s*(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>)`);
  if (re.test(s)) return s.replace(re, `<key>${key}</key>\n\t${valueXml}`);
  return s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${valueXml}\n</dict>\n</plist>\n`);
}

function ios() {
  const plist = join(mobile, 'ios', 'App', 'App', 'Info.plist');
  const found = edit(plist, (s) => {
    s = plistSet(s, 'CFBundleDisplayName', '<string>Bioluma</string>');
    s = plistSet(s, 'ITSAppUsesNonExemptEncryption', '<false/>');
    s = plistSet(s, 'UIViewControllerBasedStatusBarAppearance', '<true/>');
    s = plistSet(s, 'UISupportedInterfaceOrientations', '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>');
    return s;
  });
  if (!found) console.log('[patch-native] ios/ not found: run "npm run add:ios" first (on a Mac for building)');
  // Marketing version / build number live in the Xcode project.
  const pbx = join(mobile, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  edit(pbx, (s) => s.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`));
}

execFileSync(process.execPath, [join(mobile, 'scripts', 'check-bridge.mjs')], { stdio: 'inherit' });
if (target === 'android' || target === 'all') android();
if (target === 'ios' || target === 'all') ios();
console.log(`[patch-native] version ${version} (${versionCode})`);

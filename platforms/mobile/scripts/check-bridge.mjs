// Guards the assumption of src/platform/platform.ts: the web build calls Capacitor plugins
// through the `window.Capacitor` global injected by the native shell (nativePromise/nativeCallback),
// without bundling @capacitor/core. This fails loudly if a Capacitor upgrade removes any of it.
//   node scripts/check-bridge.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const read = (name, rel) => readFileSync(join(pkgDir(name), rel), 'utf8');

const checks = [
  ['@capacitor/android', 'capacitor/src/main/assets/native-bridge.js', ['cap.nativePromise =', 'cap.nativeCallback =', 'cap.isNativePlatform =', 'cap.getPlatform =']],
  ['@capacitor/ios', 'Capacitor/Capacitor/assets/native-bridge.js', ['cap.nativePromise =', 'cap.nativeCallback =']],
  ['@capacitor/android', 'capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java', ['public class SystemBars extends Plugin', 'public void setStyle', 'public void hide', 'public void show']],
  ['@capacitor/app', 'android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java', ['EVENT_BACK_BUTTON', 'public void minimizeApp']],
  ['@capacitor/haptics', 'android/src/main/java/com/capacitorjs/plugins/haptics/HapticsPlugin.java', ['public void impact', 'public void notification']],
];
let failed = 0;
for (const [pkg, file, needles] of checks) {
  let src = '';
  try {
    src = read(pkg, file);
  } catch {
    console.error(`missing ${pkg}/${file}`);
    failed++;
    continue;
  }
  for (const n of needles) {
    if (!src.includes(n)) {
      console.error(`${pkg}/${file}: "${n}" not found`);
      failed++;
    }
  }
}
const appEvents = read('@capacitor/app', 'android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java');
for (const ev of ['"backButton"', '"pause"', '"resume"']) {
  if (!appEvents.includes(ev)) {
    console.error(`@capacitor/app: event ${ev} not found`);
    failed++;
  }
}
if (failed) {
  console.error(`check-bridge: ${failed} problem(s); update src/platform/platform.ts for this Capacitor version.`);
  process.exit(1);
}
console.log('check-bridge: Capacitor globals and plugin methods used by platform.ts are present');

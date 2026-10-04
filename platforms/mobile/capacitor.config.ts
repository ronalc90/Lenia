import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Bioluma native shells (Android + iOS) with Capacitor 8.
 * The web game is the root Vite build (`npm run build` -> ../../dist); `npx cap sync` copies it into
 * the native projects, so the app works fully offline and needs no domain (unlike the TWA path).
 * Native look and feel is handled by platforms/shared/platform.ts through the `window.Capacitor`
 * global (back button, pause/resume, system bars, haptics); the web build has no Capacitor npm deps.
 */
const config: CapacitorConfig = {
  // Play package name / iOS bundle id: permanent once published. Must differ from the TWA package
  // if both paths are ever shipped (they would be two different store listings).
  appId: 'com.bioluma.game',
  appName: 'Bioluma',
  webDir: '../../dist',
  backgroundColor: '#0B0E12',
  zoomEnabled: false,
  android: {
    allowMixedContent: false,
    // WebGL2 + ES2022 bundle: older System WebViews show Capacitor's "update WebView" page instead.
    minWebViewVersion: 100,
    // Release AABs are signed by Gradle from env vars (scripts/patch-native.mjs); nothing secret here.
    buildOptions: { releaseType: 'AAB' },
  },
  ios: {
    contentInset: 'never', // safe areas are handled in CSS with env(safe-area-inset-*)
    scrollEnabled: false, // a game: no rubber-band scrolling of the page
    backgroundColor: '#0B0E12',
    preferredContentMode: 'mobile',
  },
  server: {
    // Origin https://localhost (Android) / capacitor://localhost (iOS): secure context, local files.
    androidScheme: 'https',
    hostname: 'localhost',
  },
  plugins: {
    // Core plugin (Capacitor 8): edge-to-edge with correct env(safe-area-inset-*) and light icons.
    SystemBars: { insetsHandling: 'css', style: 'DARK', hidden: false },
  },
};

export default config;

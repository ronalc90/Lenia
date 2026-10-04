/** Build identity, injected by vite.config.ts at build time. */
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_DATE__: string;

/** Release number, e.g. "0.003" (bumped on every published update). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.000';
/** Short commit hash of this build (or "dev"). */
export const GIT_SHA: string = typeof __GIT_SHA__ === 'string' ? __GIT_SHA__ : 'dev';
/** ISO date of the build. */
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

/** "v0.003 · 399de41" */
export const VERSION_LABEL = `v${APP_VERSION} · ${GIT_SHA}`;

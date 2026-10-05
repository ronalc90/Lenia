/**
 * The service worker's cache name is stamped with the release at build time (vite.config.ts, RF-11).
 * A fixed name meant the worker file never changed, so no new worker ever installed and the one cache
 * kept every hashed file of every release (~1.3 MB each). With one name per release the new worker
 * installs, and on activate it deletes every other "bioluma-" cache: the cache holds one release.
 */
export const SW_BUILD_PLACEHOLDER = '__BIOLUMA_BUILD__';

/** public/sw.js with its cache name set to this build (only [A-Za-z0-9.-] kept from the tag). */
export function stampServiceWorker(source: string, build: string): string {
  const tag = String(build).replace(/[^A-Za-z0-9.-]/g, '_');
  return source.split(SW_BUILD_PLACEHOLDER).join(tag);
}

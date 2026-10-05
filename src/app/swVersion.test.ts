import { describe, expect, it } from 'vitest';
import swSource from '../../public/sw.js?raw';
import { SW_BUILD_PLACEHOLDER, stampServiceWorker } from './swVersion';

describe('service worker cache is bounded to one release (RF-11)', () => {
  it('the worker in public/ carries the build placeholder in its cache name', () => {
    expect(swSource.split(SW_BUILD_PLACEHOLDER).length - 1).toBe(1);
    expect(swSource).toMatch(/const CACHE_VERSION = 'bioluma-__BIOLUMA_BUILD__';/);
  });

  it('every release gets its own cache name, so the new worker installs and deletes the old caches', () => {
    const a = stampServiceWorker(swSource, '0.016-2b5eeb4');
    const b = stampServiceWorker(swSource, '0.017-1234567');
    expect(a).not.toBe(b);
    expect(a).toContain("const CACHE_VERSION = 'bioluma-0.016-2b5eeb4';");
    expect(a).not.toContain(SW_BUILD_PLACEHOLDER);
    // activate keeps only the current cache of this app.
    expect(a).toMatch(/k\.startsWith\(CACHE_PREFIX\) && k !== CACHE_NAME/);
  });

  it('a build tag can only hold safe characters', () => {
    expect(stampServiceWorker(swSource, "x';alert(1)//")).toContain("const CACHE_VERSION = 'bioluma-x__alert_1___';");
  });
});

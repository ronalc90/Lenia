import { describe, expect, it } from 'vitest';
import lock from '../../package-lock.json';
import pkg from '../../package.json';
import release from '../../version.json';

describe('release version', () => {
  it('package.json carries the version.json release as semver (npm run bump keeps them together)', () => {
    const [major, minor] = release.version.split('.');
    expect(pkg.version).toBe(`${Number(major)}.${Number(minor)}.0`);
    expect(lock.version).toBe(pkg.version);
  });
});

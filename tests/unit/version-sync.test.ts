import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (path: string): { version: string } => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { version: string };

describe('release version', () => {
  it('package.json carries the version.json release as semver (npm run bump keeps them together)', () => {
    const [major, minor] = json('../../version.json').version.split('.');
    expect(json('../../package.json').version).toBe(`${Number(major)}.${Number(minor)}.0`);
    expect(json('../../package-lock.json').version).toBe(json('../../package.json').version);
  });
});

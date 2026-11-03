import { afterEach, describe, expect, it, vi } from 'vitest';
import swSource from '../../../public/sw.js?raw';
import { PHOTOS, PHOTO_CREDITS_NOTE, PHOTO_IDS, forgetPhotos, loadPhoto, peekPhoto, photoUrl, type PhotoId } from './photos';

/** An Image double: loads or fails on the next tick after `src` is set, like the browser. */
function fakeImage(outcome: 'load' | 'error') {
  const made: FakeImage[] = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = '';
    private s = '';
    constructor() {
      made.push(this);
    }
    get src(): string {
      return this.s;
    }
    set src(v: string) {
      this.s = v;
      setTimeout(() => (outcome === 'load' ? this.onload?.() : this.onerror?.()), 0);
    }
    decode(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { FakeImage, made };
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetPhotos();
});

describe('archive photo loader (ADR-029)', () => {
  it('resolves null where images cannot load (no DOM) and never throws', async () => {
    expect(typeof (globalThis as { Image?: unknown }).Image).toBe('undefined');
    await expect(loadPhoto('estacion-aurora-noaa')).resolves.toBeNull();
    expect(peekPhoto('estacion-aurora-noaa')).toBeNull();
  });

  it('a photo that fails to load gives null once: the failure is cached, not retried every frame', async () => {
    const { FakeImage, made } = fakeImage('error');
    vi.stubGlobal('Image', FakeImage);
    const a = loadPhoto('pipeta-guante-csiro');
    expect(loadPhoto('pipeta-guante-csiro')).toBe(a);
    await expect(a).resolves.toBeNull();
    for (let i = 0; i < 5; i++) expect(peekPhoto('pipeta-guante-csiro')).toBeNull();
    expect(made).toHaveLength(1);
    forgetPhotos(); // back online: the next call asks again
    await loadPhoto('pipeta-guante-csiro');
    expect(made).toHaveLength(2);
  });

  it('a photo that loads comes from ./art/photos/<id>.webp and draw loops can peek at it', async () => {
    const { FakeImage, made } = fakeImage('load');
    vi.stubGlobal('Image', FakeImage);
    expect(peekPhoto('placa-microscopio-nci')).toBeNull(); // starts the load
    const img = await loadPhoto('placa-microscopio-nci');
    expect(img).not.toBeNull();
    expect(made).toHaveLength(1);
    expect(made[0].src).toBe(photoUrl('placa-microscopio-nci'));
    expect(made[0].src.endsWith('art/photos/placa-microscopio-nci.webp')).toBe(true);
    expect(peekPhoto('placa-microscopio-nci')).toBe(img);
  });

  it('an unknown id resolves null', async () => {
    await expect(loadPhoto('no-such-photo' as PhotoId)).resolves.toBeNull();
  });
});

/** Width and height from a WebP header (VP8 lossy or VP8L lossless). */
function webpSize(b: Uint8Array): [number, number] {
  const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (tag === 'VP8 ') return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
  if (tag === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  return [0, 0];
}

// Read the files from disk; a computed specifier keeps the project free of Node typings (as tokens.test.ts).
const fs = (await import('node:' + 'fs')) as unknown as {
  readdirSync(p: URL): string[];
  readFileSync(p: URL): Uint8Array;
  statSync(p: URL): { size: number };
};
const dir = new URL('../../../public/art/photos/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));

describe('the shipped photos (docs/ARTE-REALISTA.md §9, CREDITS.md)', () => {
  it('are exactly the credited photos, WebP, at most 50 KB each and 600 KB in total', () => {
    expect(files.sort()).toEqual(PHOTO_IDS.map((id) => `${id}.webp`).sort());
    let total = 0;
    for (const f of files) {
      const size = fs.statSync(new URL(f, dir)).size;
      expect(size, f).toBeLessThanOrEqual(50_000);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(600_000);
  });

  it('declare their real pixel size', () => {
    for (const id of PHOTO_IDS) expect(webpSize(fs.readFileSync(new URL(`${id}.webp`, dir))), id).toEqual([PHOTOS[id].w, PHOTOS[id].h]);
  });

  it('each carries a bilingual credit with author, licence link and the changes made', () => {
    for (const id of PHOTO_IDS) {
      const p = PHOTOS[id];
      expect(p.id).toBe(id);
      for (const lang of ['es', 'en'] as const) {
        expect(p.credit[lang]).toContain(p.author);
        expect(p.credit[lang]).toContain(p.licence[lang]);
        expect(p.credit[lang].length).toBeGreaterThan(p.title[lang].length + p.author.length);
      }
      expect(p.source).toMatch(/^https:\/\//);
      expect(p.licenceUrl).toMatch(/^https:\/\//);
    }
    expect(PHOTOS['pipeta-guante-csiro'].licenceUrl).toBe('https://creativecommons.org/licenses/by/3.0/');
    expect(PHOTO_CREDITS_NOTE.es).toContain('no respaldan');
    expect(PHOTO_CREDITS_NOTE.en).toContain('do not endorse');
  });

  it('are precached by the service worker, so the intro looks the same offline', () => {
    for (const id of PHOTO_IDS) expect(swSource, id).toContain(`'${id}'`);
    expect(swSource).toContain('./art/photos/${id}.webp');
  });
});

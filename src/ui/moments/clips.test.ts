import { describe, expect, it } from 'vitest';
import { MOMENTS } from '../../moments/catalog';
import { CLIP_SPECS, LeniaClip, countBlobs, rulesClip } from './clips';
import { ILLUSTRATION_KINDS } from './illustrations';
import { MS } from './strings';

/** Run a clip to the end (CPU reference Lenia, no DOM needed). */
function run(name: keyof typeof CLIP_SPECS): LeniaClip {
  const c = new LeniaClip(CLIP_SPECS[name]);
  while (!c.pump(1000));
  return c;
}

function travel(c: LeniaClip): number {
  let d = 0;
  for (let i = 1; i < c.frames.length; i++) {
    let dx = c.frames[i].cx - c.frames[i - 1].cx;
    let dy = c.frames[i].cy - c.frames[i - 1].cy;
    dx -= Math.round(dx / c.N) * c.N;
    dy -= Math.round(dy / c.N) * c.N;
    d += Math.hypot(dx, dy);
  }
  return d;
}

describe('explainer diagrams are real Lenia that does what the card says', () => {
  it('"too little matter" really fades away', () => {
    const c = run('fade');
    expect(c.frames[0].mass).toBeGreaterThan(20);
    expect(c.frames[c.frames.length - 1].mass).toBeLessThan(1);
  });

  it('"too much matter" really floods the box', () => {
    const c = run('flood');
    expect(c.frames[0].fill).toBeLessThan(0.15);
    expect(Math.max(...c.frames.map((f) => f.fill))).toBeGreaterThan(0.6);
  });

  it('"just right" really becomes one creature that holds its shape', () => {
    const c = run('live');
    const last = c.frames[c.frames.length - 1];
    expect(countBlobs(last, c.N)).toBe(1);
    expect(last.mass).toBeGreaterThan(40);
    expect(last.mass).toBeLessThan(120);
  });

  it('the swimmer swims, the spinner circles in place, the pulser and the still one stay', () => {
    const swim = run('swim');
    const spin = run('spin');
    const pulse = run('pulse');
    const still = run('still');
    expect(travel(swim)).toBeGreaterThan(40);
    // Spinner moves a lot but stays near home (circles).
    const s0 = spin.frames[0];
    const sN = spin.frames[spin.frames.length - 1];
    let dx = sN.cx - s0.cx;
    let dy = sN.cy - s0.cy;
    dx -= Math.round(dx / 64) * 64;
    dy -= Math.round(dy / 64) * 64;
    expect(travel(spin)).toBeGreaterThan(15);
    expect(Math.hypot(dx, dy)).toBeLessThan(12);
    expect(travel(pulse)).toBeLessThan(3);
    const masses = pulse.frames.map((f) => f.mass);
    expect((Math.max(...masses) - Math.min(...masses)) / masses[0]).toBeGreaterThan(0.03);
    expect(travel(still)).toBeLessThan(6);
  });

  it('the overflowing dish really buds into far too many blobs', () => {
    const c = run('overgrow');
    expect(countBlobs(c.frames[0], c.N)).toBe(1);
    expect(countBlobs(c.frames[c.frames.length - 1], c.N)).toBeGreaterThan(10);
  });

  it('"same spore, other rules": Orbium rules live, high σ overflows', () => {
    const a = rulesClip({ mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 });
    const b = rulesClip({ mu: 0.15, sigma: 0.026, R: 13, dt: 0.1 });
    while (!a.pump(1000));
    while (!b.pump(1000));
    expect(countBlobs(a.frames[a.frames.length - 1], 64)).toBe(1);
    expect(countBlobs(b.frames[b.frames.length - 1], 64)).toBeGreaterThan(3);
  });
});

describe('moments UI coverage', () => {
  it('every moment has a diagram', () => {
    for (const m of MOMENTS) expect(ILLUSTRATION_KINDS, m.id).toContain(m.illustration);
  });

  it('every UI string is bilingual', () => {
    for (const [k, v] of Object.entries(MS)) {
      expect(v.es.trim(), k).not.toBe('');
      expect(v.en.trim(), k).not.toBe('');
    }
  });
});

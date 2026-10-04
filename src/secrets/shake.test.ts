import { describe, expect, it } from 'vitest';
import { createJiggleDetector, createShakeDetector } from './shake';
import { seededRng } from './testUtil';

describe('shake detector (DeviceMotion)', () => {
  it('a vigorous shake (alternating jolts) is detected once, then cools down', () => {
    const s = createShakeDetector();
    let fired = 0;
    for (let i = 0; i < 40; i++) {
      const t = i * 60;
      const ax = i % 2 ? 18 : -18;
      if (s.feed(ax, 9.8, 0, t)) fired++;
    }
    expect(fired).toBe(1);
  });

  it('walking with the phone (small, slow changes) never fires', () => {
    const s = createShakeDetector();
    const rng = seededRng(3);
    let fired = 0;
    for (let i = 0; i < 2000; i++) {
      const t = i * 16;
      if (s.feed(Math.sin(i / 10) * 3 + rng() * 2, 9.8 + Math.cos(i / 7) * 2, rng() * 2, t)) fired++;
    }
    expect(fired).toBe(0);
  });

  it('a single bump is not a shake', () => {
    const s = createShakeDetector();
    expect(s.feed(0, 9.8, 0, 0)).toBe(false);
    expect(s.feed(25, 9.8, 0, 16)).toBe(false);
    expect(s.feed(0, 9.8, 0, 32)).toBe(false);
    for (let i = 3; i < 100; i++) expect(s.feed(0, 9.8, 0, i * 16)).toBe(false);
  });
});

describe('jiggle detector (mouse / window)', () => {
  it('fast back-and-forth movement fires', () => {
    const j = createJiggleDetector();
    let fired = false;
    for (let i = 0; i < 80 && !fired; i++) {
      const t = i * 16;
      const x = 400 + Math.sin(i * 0.9) * 60;
      fired = j.feed(x, t);
    }
    expect(fired).toBe(true);
  });

  it('slow wandering and small tremors do not fire', () => {
    const j = createJiggleDetector();
    const rng = seededRng(9);
    let fired = 0;
    let x = 300;
    for (let i = 0; i < 3000; i++) {
      x += (rng() - 0.5) * 8; // tremor
      if (i % 200 < 100) x += 1.5; // slow drift right, then left
      else x -= 1.5;
      if (j.feed(x, i * 16)) fired++;
    }
    expect(fired).toBe(0);
  });

  it('back-and-forth too slow (outside the window) does not fire', () => {
    const j = createJiggleDetector();
    let fired = false;
    for (let i = 0; i < 400; i++) fired = j.feed(400 + Math.sin(i * 0.05) * 80, i * 16) || fired;
    expect(fired).toBe(false);
  });
});

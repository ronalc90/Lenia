import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, ParticlePool } from './particles';

/** A-10 acceptance: a fixed pool that recycles its oldest particle and never grows. */
describe('particle pool', () => {
  it('10 000 emissions do not grow the pool', () => {
    const p = new ParticlePool();
    p.setCapacity(256);
    const arrays = [p.ax, p.ay, p.ox, p.oy, p.vx, p.vy, p.t0, p.life, p.size, p.drag, p.grav, p.sprite, p.color];
    for (let i = 0; i < 10_000; i++) p.emit(i, i, 0, 0, 1, 1, i * 1e-4, 10, 4, 0, 0, 2.4, 0);
    expect([p.ax, p.ay, p.ox, p.oy, p.vx, p.vy, p.t0, p.life, p.size, p.drag, p.grav, p.sprite, p.color]).toEqual(arrays);
    for (const a of arrays) expect(a.length).toBe(MAX_PARTICLES);
    expect(p.liveCount(1)).toBe(256);
  });

  it('when full, the oldest particle is the one replaced (a ring, no shift)', () => {
    const p = new ParticlePool();
    p.setCapacity(8);
    for (let i = 0; i < 9; i++) p.emit(i, 0, 0, 0, 0, 0, 0, 5, 1, 0, 0, 0, 0);
    const xs = Array.from(p.ax.subarray(0, 8));
    expect(xs).toContain(8);
    expect(xs).not.toContain(0);
  });

  it('expired particles stop being live; drag slows them; gravity pulls them', () => {
    const p = new ParticlePool();
    p.setCapacity(16);
    p.emit(0, 0, 0, 0, 100, 0, 0, 0.5, 1, 0, 0, 2.4, 50);
    p.step(0.1, 0.05);
    expect(p.vx[0]).toBeLessThan(100);
    expect(p.vy[0]).toBeGreaterThan(0);
    p.step(0.6, 0.05);
    expect(p.liveCount(0.6)).toBe(0);
  });

  it('bursts are deterministic (no Math.random)', () => {
    const a = new ParticlePool();
    const b = new ParticlePool();
    const o = { speed: [60, 90] as const, life: 0.45, size: 3, sprite: 0, color: 0, drag: 2.4, grav: 0 };
    a.burst(10, 10, 6, 0, o);
    b.burst(10, 10, 6, 0, o);
    expect(Array.from(a.vx.subarray(0, 6))).toEqual(Array.from(b.vx.subarray(0, 6)));
  });
});

import { describe, expect, it } from 'vitest';
import { CATALOG, catalogPattern, paramsOf } from './catalog';
import { CpuLenia } from './cpu';
import { angleDelta, DEFLECT, Deflector, type Body } from './deflect';
import { guardHeading, STEER, Steering } from './steer';

const dish = { cx: 64, cy: 64, radius: 48 };
const open = { cx: 32, cy: 32, radius: 1e6 };

/** Speed-0.5 swimmer heading `h`. */
function swimmer(id: number, x: number, y: number, h: number, extra: Partial<Body> = {}): Body {
  return { id, x, y, vx: 0.5 * Math.cos(h), vy: 0.5 * Math.sin(h), radius: 5.5, ...extra };
}

/** Run the guide over `n` updates, turning the body's heading by every turn it returns. */
function drive(st: Steering, b: Body, n: number, d = dish): number[] {
  const out: number[] = [];
  let step = 0;
  for (let k = 0; k < n; k++) {
    const turns = st.update([b], d, step, [], 10);
    let h = Math.atan2(b.vy, b.vx);
    for (const t of turns) {
      out.push(t.angle);
      h += t.angle;
    }
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = sp * Math.cos(h);
    b.vy = sp * Math.sin(h);
    step += 10;
  }
  return out;
}

/** Circular (torus) centroid of a field: compact bodies across the wrap are measured right. */
function torusCentroid(A: Float32Array, n: number): { x: number; y: number; m: number } {
  let m = 0;
  let cx = 0;
  let sx = 0;
  let cy = 0;
  let sy = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = A[y * n + x];
      if (!v) continue;
      m += v;
      const ax = (2 * Math.PI * (x + 0.5)) / n;
      const ay = (2 * Math.PI * (y + 0.5)) / n;
      cx += v * Math.cos(ax);
      sx += v * Math.sin(ax);
      cy += v * Math.cos(ay);
      sy += v * Math.sin(ay);
    }
  const wrap = (a: number) => ((((a / (2 * Math.PI)) * n) % n) + n) % n;
  return { x: wrap(Math.atan2(sx, cx)), y: wrap(Math.atan2(sy, cy)), m };
}

/** Roll the torus by whole cells so (x, y) lands near the centre: an exact copy (Lenia is translation-invariant). */
function recentre(sim: CpuLenia, x: number, y: number): { dx: number; dy: number } {
  const n = sim.w;
  const dx = Math.round(n / 2 - x);
  const dy = Math.round(n / 2 - y);
  if (!dx && !dy) return { dx: 0, dy: 0 };
  const old = Float32Array.from(sim.A);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) sim.A[(((j + dy) % n) + n) % n * n + ((((i + dx) % n) + n) % n)] = old[j * n + i];
  return { dx, dy };
}

describe('finger guide (steer.ts, ADR-030)', () => {
  it('turns a swimmer towards the requested heading, a bounded step per update, then forgets the request', () => {
    const st = new Steering();
    const b = swimmer(1, 64, 64, 0);
    st.request(1, Math.PI / 2);
    const turns = drive(st, b, 14);
    for (const a of turns) expect(Math.abs(a)).toBeLessThanOrEqual(STEER.maxTurn + 1e-12);
    expect(Math.abs(angleDelta(Math.atan2(b.vy, b.vx), Math.PI / 2))).toBeLessThan(STEER.done + 1e-9);
    expect(st.has(1)).toBe(false);
  });

  it('a guide turn never blinds the deflector: each one is below what it reads as a spinner', () => {
    expect(STEER.maxTurn).toBeLessThan(DEFLECT.maxCurl - 0.05);
    // Guided swimmer heading for the glass: the deflector, run first every update, still turns it off.
    const st = new Steering();
    const def = new Deflector();
    const b = swimmer(1, dish.cx + 10, dish.cy, 0);
    st.request(1, 0.4); // a little to the right of the rim normal: allowed while far away
    let step = 0;
    let rimTurns = 0;
    for (let k = 0; k < 40; k++) {
      const dt = def.update([b], dish, step, 10);
      rimTurns += dt.length;
      const gt = st.update([b], dish, step, dt, 10);
      let h = Math.atan2(b.vy, b.vx);
      for (const t of [...dt, ...gt]) h += t.angle;
      b.vx = 0.5 * Math.cos(h);
      b.vy = 0.5 * Math.sin(h);
      b.x += b.vx * 10;
      b.y += b.vy * 10;
      if (k % 3 === 0) st.request(1, 0.4); // the finger keeps asking for the glass
      // The outline never crosses the clearance line.
      expect(Math.hypot(b.x - dish.cx, b.y - dish.cy) + b.radius * DEFLECT.extentK).toBeLessThan(dish.radius);
      step += 10;
    }
    expect(rimTurns).toBeGreaterThan(0);
  });

  it('steering never turns a body into the glass: a heading out of the dish near the rim is cut to the tangent', () => {
    // Close to the right-hand rim, swimming down along it; the finger asks for straight out (east).
    const b = swimmer(1, dish.cx + dish.radius - 5.5 * DEFLECT.extentK - DEFLECT.margin - 4, dish.cy, Math.PI / 2);
    const cut = guardHeading(b, 0.2, dish, STEER.guardUpdates * 10);
    expect(Math.abs(angleDelta(cut, Math.PI / 2))).toBeLessThan(1e-9); // the tangent it was already following
    expect(guardHeading(b, Math.PI, dish, STEER.guardUpdates * 10)).toBe(Math.PI); // back into the dish: as asked
    const st = new Steering();
    st.request(1, 0.1);
    const turns = drive(st, b, 6);
    let h = Math.PI / 2;
    for (const a of turns) {
      h += a;
      // Never heading outwards (the outward normal is +x here).
      expect(Math.cos(h)).toBeLessThanOrEqual(1e-9);
    }
    // Far from the rim the same request is followed: the deflector bounces it when it gets there.
    const far = swimmer(2, dish.cx - 20, dish.cy, Math.PI / 2);
    expect(guardHeading(far, 0.1, dish, STEER.guardUpdates * 10)).toBe(0.1);
  });

  it('spinners and blobs are never steered (nor still ones), and the deflector comes first', () => {
    const st = new Steering();
    // Curling: the heading turns 0.6 rad per update by itself (Gyrorbium).
    const spin = swimmer(1, 64, 64, 0);
    st.request(1, 2);
    for (let k = 0; k < 5; k++) {
      const h = k * 0.6;
      spin.vx = 0.3 * Math.cos(h);
      spin.vy = 0.3 * Math.sin(h);
      expect(st.update([spin], dish, k * 10, [], 10)).toEqual([]);
    }
    // A blob (steerable false) and a still creature.
    const blob = swimmer(2, 60, 60, 0, { steerable: false });
    const still = { id: 3, x: 70, y: 70, vx: 0.01, vy: 0, radius: 5 };
    const st2 = new Steering();
    st2.request(2, 1);
    st2.request(3, 1);
    for (let k = 0; k < 4; k++) expect(st2.update([blob, still], dish, k * 10, [], 10)).toEqual([]);
    // The deflector turned it this update: no guide turn on top.
    const st3 = new Steering();
    const sw = swimmer(4, 64, 64, 0);
    st3.request(4, 1.5);
    st3.update([sw], dish, 0, [], 10); // first sight: heading learnt
    expect(st3.update([sw], dish, 10, [{ id: 4, x: 64, y: 64, radius: 12, angle: 0.5 }], 10)).toEqual([]);
  });

  it('a request is cancelled with null and expires when the finger stops renewing it', () => {
    const st = new Steering();
    const b = swimmer(1, 64, 64, 0);
    st.request(1, 3);
    st.request(1, null);
    expect(st.pending).toBe(0);
    // The body leaves the view (it went dark, it merged): its request goes with it.
    st.request(1, 3);
    st.update([b], dish, 0, [], 10);
    st.update([], dish, 10, [], 10);
    expect(st.pending).toBe(0);
    // Not renewed: gone after holdUpdates updates even if not reached (a spinner it never turns).
    const sp = swimmer(2, 64, 64, 0);
    st.request(2, 2);
    for (let k = 0; k < STEER.holdUpdates; k++) {
      sp.vx = 0.3 * Math.cos(k * 0.6);
      sp.vy = 0.3 * Math.sin(k * 0.6);
      st.update([sp], dish, k * 10, [], 10);
    }
    expect(st.has(2)).toBe(false);
  });

  it('an Orbium steered 90° survives 2 000 steps and swims the new way (CPU reference, 64²)', () => {
    const e = CATALOG.find((c) => c.code === 'O2u')!;
    const n = 64;
    const sim = new CpuLenia(n, n, paramsOf(e));
    sim.placeCentered(catalogPattern('O2u'), 32, 32);
    sim.step(50);
    const m0 = sim.mass();
    const st = new Steering();
    let prev = torusCentroid(sim.A, n);
    const r0 = recentre(sim, prev.x, prev.y);
    prev = { x: prev.x + r0.dx, y: prev.y + r0.dy, m: prev.m };
    let h0: number | null = null;
    let target = 0;
    let headings: number[] = [];
    let turned = 0;
    for (let k = 0; k < 195; k++) {
      sim.step(10);
      const c = torusCentroid(sim.A, n);
      const vx = (c.x - prev.x) / 10;
      const vy = (c.y - prev.y) / 10;
      const h = Math.atan2(vy, vx);
      if (k === 3) {
        h0 = h;
        target = h + Math.PI / 2;
        st.request(1, target);
      }
      if (h0 !== null && k < 40 && k % 3 === 0) st.request(1, target);
      if (k > 60) headings.push(h);
      const turns = st.update([{ id: 1, x: c.x, y: c.y, vx, vy, radius: 5.6 }], open, sim.stepCount, [], 10);
      for (const t of turns) turned += t.angle;
      sim.applyTurns(turns);
      // Keep the body away from the grid edge (the CPU rotate pass does not wrap): an exact whole-cell roll.
      const r = recentre(sim, c.x, c.y);
      prev = { x: c.x + r.dx, y: c.y + r.dy, m: c.m };
    }
    const m1 = sim.mass();
    expect(m1 / m0).toBeGreaterThan(0.8);
    expect(m1 / m0).toBeLessThan(1.25);
    expect(Math.abs(turned)).toBeGreaterThan(Math.PI / 2 - 0.35);
    // It still swims, in the new direction (mean heading of the last updates within 25° of the target).
    let sx = 0;
    let sy = 0;
    for (const a of headings) {
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    headings = [];
    expect(Math.abs(angleDelta(Math.atan2(sy, sx), target))).toBeLessThan(0.45);
  });
});

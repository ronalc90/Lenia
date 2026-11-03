import { describe, expect, it } from 'vitest';
import { TREE_LAYOUT, TREE_NODES, treeStates, type TreeCtx } from '../../game/tree';
import { D, NODE_EXTENT, TAP_QUIET_MS, buyableIds, nodeRect, openingCam, revealCam, tapAllowed, type Area, type Cam, freeTop } from './camera';

/** A 390 × 844 phone: the top bar and VELA take 150 px, the "Puedes comprar" strip 96 px. */
const PHONE: Area = { left: 0, top: 150, right: 390, bottom: 844 - 96 };
const LAPTOP: Area = { left: 0, top: 96, right: 1366, bottom: 768 - 90 };

const world = (id: string) => {
  const p = TREE_LAYOUT.get(id)!;
  return { x: p.x * D, y: p.y * D };
};
const inside = (r: { l: number; t: number; r: number; b: number }, a: Area) => r.l >= a.left - 0.5 && r.r <= a.right + 0.5 && r.t >= a.top - 0.5 && r.b <= a.bottom + 0.5;

/** Every first node of a route bought once and plenty of Datos: buyable nodes in every direction. */
function spread(datos: number, night = 1): TreeCtx {
  const levels: Record<string, number> = { lab: night };
  for (const n of TREE_NODES) if (n.step === 1 && n.branch !== 'core') levels[n.id] = 1;
  return { levels, datos, sessions: 12, species: 7 };
}

describe('the Tree camera (docs/CLARIDAD2.md §2.10)', () => {
  it('QA#12: selecting a visible node never moves the camera', () => {
    const cam: Cam = { x: 195, y: 420, z: 0.9 };
    for (const n of TREE_NODES) {
      const r = nodeRect(world(n.id), cam);
      if (!inside(r, PHONE)) continue;
      expect(revealCam(cam, world(n.id), PHONE), n.id).toBeNull();
    }
  });

  it('a node under the sheet moves the least it can (16 px inside), and never zooms', () => {
    const cam: Cam = { x: 195, y: 420, z: 0.9 };
    const sheetUp: Area = { ...PHONE, bottom: 420 };
    let moved = 0;
    for (const n of TREE_NODES) {
      if (inside(nodeRect(world(n.id), cam), sheetUp)) continue;
      const next = revealCam(cam, world(n.id), sheetUp);
      if (!next) continue;
      moved++;
      expect(next.z).toBe(cam.z);
      const r = nodeRect(world(n.id), next);
      expect(inside(r, sheetUp), n.id).toBe(true);
      // Minimal: one edge sits exactly 16 px inside the area, on the side it came from.
      const gaps = [r.l - sheetUp.left, sheetUp.right - r.r, r.t - sheetUp.top, sheetUp.bottom - r.b];
      if (Math.abs(next.y - cam.y) > 0.5) expect(Math.min(gaps[2], gaps[3])).toBeCloseTo(16, 5);
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('opening the tree fits every buyable node on screen', () => {
    for (const area of [PHONE, LAPTOP])
      for (const ctx of [
        { levels: { lab: 1 }, datos: 28, sessions: 1, species: 1 },
        spread(60),
        spread(900),
        spread(5000, 2),
        spread(1e6, 3),
      ] as TreeCtx[]) {
        const states = treeStates(ctx);
        const ids = buyableIds(states);
        expect(ids.length).toBeGreaterThan(0);
        const cam = openingCam(states, area);
        for (const id of ids) expect(inside(nodeRect(world(id), cam), area), `${id} @ ${area.right}px, datos ${ctx.datos}`).toBe(true);
      }
  });

  it('a far-away World 4 is framed, not left at x = −6 (QA-CLARIDAD #38)', () => {
    const ctx = spread(5000, 2);
    const states = treeStates(ctx);
    const far = buyableIds(states).sort((a, b) => Math.hypot(world(b).x, world(b).y) - Math.hypot(world(a).x, world(a).y))[0];
    const r = nodeRect(world(far), openingCam(states, PHONE));
    expect(r.l).toBeGreaterThanOrEqual(0);
    expect(r.r).toBeLessThanOrEqual(390);
  });

  it('a tap right after a camera move is ignored', () => {
    expect(TAP_QUIET_MS).toBe(350);
    expect(tapAllowed(1000, 900)).toBe(false);
    expect(tapAllowed(1000, 1000 - TAP_QUIET_MS)).toBe(true);
    expect(tapAllowed(1000, -Infinity)).toBe(true);
  });

  it('a node box holds its 64-px tile and the name and price below it', () => {
    const r = nodeRect({ x: 0, y: 0 }, { x: 100, y: 100, z: 1 });
    expect(r.t).toBe(100 - NODE_EXTENT.above);
    expect(r.b).toBe(100 + NODE_EXTENT.below);
    expect(r.r - r.l).toBe(2 * NODE_EXTENT.half);
  });
});

// Integration play-through of the clarity pass: right after «Ir al Árbol» the Tree showed tiny nodes parked
// under the «Puedes comprar» strip (PC's run: "no nodes"). VELA's bubble was measured as the top bar while it
// still sat at the bottom of the screen on its way to the dock: the free area collapsed to a 60-px band.
describe('the free area of the Tree under VELA\'s docked bubble', () => {
  it('a bubble docked at the top pushes the frame down', () => {
    expect(freeTop(100, { top: 110, bottom: 190 }, 844)).toBe(200);
  });
  it('a bubble still at the bottom of the screen never squeezes the frame', () => {
    expect(freeTop(100, { top: 700, bottom: 830 }, 844)).toBe(110);
    expect(freeTop(100, { top: 300, bottom: 520 }, 844)).toBe(110);
  });
  it('without a bar the frame starts below the minimum inset', () => {
    expect(freeTop(0, null, 844)).toBe(78);
  });
});

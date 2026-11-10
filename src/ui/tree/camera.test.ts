import { describe, expect, it } from 'vitest';
import { TREE_LAYOUT, TREE_NODES, treeStates, type TreeCtx } from '../../game/tree';
import { D, NODE_EXTENT, PHONE_Z_MIN, TAP_QUIET_MS, buyPressAllowed, buyableIds, nodeRect, openingCam, revealCam, tapAllowed, type Area, type Cam, freeTop, gateLabelAngle, LABEL_EDGE } from './camera';

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

  // QA-4 N18 (c1-157, c4-015): the Night-2 Tree opened with 18-px nodes on a 390-px phone (30 px at 360). On a phone the
  // camera never shows a node under 44 px; the opening frame shows the cheapest node to buy (the strip lists the rest).
  it('QA-4 N18: on a phone every node is at least 44 px and the cheapest node to buy is on screen', () => {
    expect(64 * PHONE_Z_MIN).toBeGreaterThanOrEqual(44);
    for (const ctx of [{ levels: { lab: 1 }, datos: 28, sessions: 1, species: 1 }, spread(60), spread(900), spread(5000, 2), spread(1e6, 3)] as TreeCtx[]) {
      const states = treeStates(ctx);
      const cam = openingCam(states, PHONE, PHONE_Z_MIN);
      expect(64 * cam.z, `datos ${ctx.datos}`).toBeGreaterThanOrEqual(44);
      const ids = buyableIds(states).filter((id) => id !== 'lab');
      const cheapest = ids.sort((a, b) => states.get(a)!.cost - states.get(b)!.cost)[0];
      if (cheapest) expect(inside(nodeRect(world(cheapest), cam), PHONE), `${cheapest}, datos ${ctx.datos}`).toBe(true);
    }
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

// Integrator review v0.023 (shot 49): the «Noche 2» label sat on its dashed circle beyond the left edge and
// read «ne 2». A label slides along its circle until the whole of it is inside the free area.
describe('night labels on their dashed circles', () => {
  const PREFER = ((-90 + 5.5 * (360 / 7)) * Math.PI) / 180;
  const half = { w: 40, h: 12 };
  const box = (cam: Cam, r: number, a: number) => {
    const x = cam.x + Math.cos(a) * r * cam.z;
    const y = cam.y + Math.sin(a) * r * cam.z;
    return { l: x - half.w, r: x + half.w, t: y - half.h, b: y + half.h };
  };
  const inside = (b: { l: number; r: number; t: number; b: number }, a: Area) =>
    b.l >= a.left + LABEL_EDGE && b.r <= a.right - LABEL_EDGE && b.t >= a.top + LABEL_EDGE && b.b <= a.bottom - LABEL_EDGE;

  it('a label whose spot is off screen slides along its circle into view', () => {
    // Shot 49: the circle of night 2 is wider than the phone; its preferred spot is past the left edge.
    const cam: Cam = { x: 195, y: 450, z: 0.62 };
    const r = 3.2 * D;
    expect(inside(box(cam, r, PREFER), PHONE)).toBe(false);
    const a = gateLabelAngle(cam, r, half, PHONE, PREFER);
    expect(a).not.toBeNull();
    expect(inside(box(cam, r, a!), PHONE)).toBe(true);
  });

  it('a label that fits keeps its spot', () => {
    const cam: Cam = { x: 195, y: 450, z: 0.3 };
    const r = 3.2 * D;
    expect(gateLabelAngle(cam, r, half, PHONE, PREFER)).toBeCloseTo(PREFER, 6);
  });

  it('a circle with no point on screen hides its label instead of showing it cut', () => {
    const cam: Cam = { x: 195, y: 450, z: 1.9 };
    expect(gateLabelAngle(cam, 6 * D, half, PHONE, PREFER)).toBeNull();
  });
});

// QA-3 §2: the third of four fast taps landed on a sheet's «Comprar» and bought «Placa más grande». The slow phone
// handled it more than TAP_QUIET_MS after the sheet opened, but the finger had come down long before.
describe('«Comprar» needs its sheet on screen first (QA-3 §2)', () => {
  it('QA-3: a finger that came down before the sheet had been shown for a moment never buys, however late it is handled', () => {
    const sheetAt = 1000;
    expect(buyPressAllowed(sheetAt + 120, sheetAt, -Infinity)).toBe(false);
    expect(buyPressAllowed(sheetAt - 50, sheetAt, -Infinity)).toBe(false);
  });

  it('a deliberate press once the sheet has been up ≥ 300 ms buys', () => {
    expect(TAP_QUIET_MS).toBeGreaterThanOrEqual(300);
    expect(buyPressAllowed(1000 + TAP_QUIET_MS, 1000, -Infinity)).toBe(true);
  });

  it('nor right after the camera moved under it', () => {
    expect(buyPressAllowed(5000, 1000, 4900)).toBe(false);
  });
});

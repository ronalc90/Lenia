import { describe, expect, it } from 'vitest';
import { catalogByCode, catalogPattern } from '../sim/catalog';
import * as B from './balance';
import { createGame } from './game';
import { nearestCatalog, resamplePattern, sporeCandidates } from './seeding';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

/** Tests of the paid-seed mechanics start without the new-game charges (free + guaranteed seeds). */
function plainSpores(g: { state: unknown }): void {
  (g.state as { charges: { free: number; guaranteed: number } }).charges = { free: 0, guaranteed: 0 };
}

describe('seeding', () => {
  it('a brand-new game starts with a guaranteed first seed and a few free ones (QA2 H-04)', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(30) });
    expect(g.view().charges).toEqual({ free: B.START_FREE_SEEDS, guaranteed: B.START_GUARANTEED_SEEDS });
    const first = g.actions.seedAt(40, 40)!;
    expect(first.bias).toBe(1);
    expect(first.shape).toBe('pattern');
    expect(g.view().essence).toBe(B.START_ESSENCE + B.OBJECTIVES[0].reward);
    const spots = [[120, 40], [40, 140], [120, 140], [80, 210]];
    for (let i = 1; i < B.START_FREE_SEEDS; i++) expect(g.actions.seedAt(spots[i - 1][0], spots[i - 1][1])!.bias).toBeLessThan(1);
    expect(g.view().essence).toBe(B.START_ESSENCE + B.OBJECTIVES[0].reward);
    expect(g.view().charges).toEqual({ free: 0, guaranteed: 0 });
  });

  it('seed cost = c0·(r/R)²·(1 + 0.25·n_alive)·saturation^(n_alive − free), start with 20 essence', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1) });
    expect(g.view().essence).toBe(B.START_ESSENCE);
    expect(g.view().seedCost).toBeCloseTo(2, 10);
    const cost = (n: number, free = B.DISH_FREE_SLOTS[0]) =>
      B.SEED_C0 * (1 + B.SEED_CROWD * n) * Math.pow(B.SEED_SATURATION_GROWTH, Math.max(0, n - free));
    // Within the free slots it is exactly the doc formula.
    g.tick(0.01, report([creature({ id: 1 })]));
    expect(g.view().seedCost).toBeCloseTo(2 * (1 + 0.25 * 1), 10);
    // Stable creatures count; exploded / dead do not.
    const cs = [1, 2, 3, 4, 5].map((id) => creature({ id, x: id * 30, state: id === 4 ? 'exploded' : id === 5 ? 'dead' : 'stable' }));
    g.tick(0.01, report(cs));
    expect(g.view().seedCost).toBeCloseTo(cost(3), 10);
    // Placa adds free slots.
    (g.state as { upgrades: Record<string, number> }).upgrades.dish = 2;
    expect(g.view().seedCost).toBeCloseTo(cost(3, B.DISH_FREE_SLOTS[2]), 10);
    expect(B.DISH_FREE_SLOTS[2]).toBeGreaterThanOrEqual(3);
    expect(g.view().seedCost).toBeCloseTo(2 * (1 + 0.25 * 3), 10);
  });

  it('newborns count: a short burst is cheap, spamming escalates, and the nursery caps a burst', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(11) });
    (g.state as { essence: number; objective: number }).essence = 1e6;
    (g.state as { objective: number }).objective = B.OBJECTIVES.length;
    const costs: number[] = [];
    const placed: (object | null)[] = [];
    for (let i = 0; i < 6; i++) {
      costs.push(g.view().seedCost);
      placed.push(g.actions.seedAt(30 + (i % 3) * 64, 30 + Math.floor(i / 3) * 90)); // far apart; not yet detected: pending
    }
    // A burst: the first SEED_NURSERY_MAX land, the rest wait ("⏳ Espera…"), free of charge.
    expect(placed.filter(Boolean).length).toBe(B.SEED_NURSERY_MAX);
    expect(count('seedBlocked')).toBe(6 - B.SEED_NURSERY_MAX);
    expect(g.view().seedsGrowing).toBe(true);
    const nursery = B.SEED_NURSERY_FREE + B.DISH_FREE_SLOTS[0];
    for (let i = 0; i < 6; i++) {
      const n = Math.min(i, B.SEED_NURSERY_MAX);
      const sat = Math.pow(B.SEED_SATURATION_GROWTH, Math.max(0, n - nursery));
      expect(costs[i]).toBeCloseTo(B.SEED_C0 * (1 + B.SEED_CROWD * n) * sat, 10);
    }
    // After the pending window, undetected seeds no longer count.
    g.tick(B.SEED_PENDING_WINDOW + 0.1, report([]));
    expect(g.view().seedCost).toBeCloseTo(B.SEED_C0, 10);
  });

  it('pays the cost, returns a spore spec, refuses when broke', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2) });
    plainSpores(g);
    (g.state as { objective: number }).objective = B.OBJECTIVES.length; // no objective rewards
    let n = 0;
    while (g.actions.seedAt(10 + n, 10)) {
      n++;
      g.tick(B.SEED_SPACING_MEMORY + 0.1, report([])); // the seeds dissolved
    }
    expect(n).toBe(10); // 20 essence / 2 per seed
    expect(g.view().essence).toBeCloseTo(0, 10);
    expect(count('seedDenied')).toBe(1);
    expect(count('seed')).toBe(10);
  });

  it('spec: radius≈R, density 0.6–0.8, asymmetric noise, bias template of a catalog species near the calibration', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(3) });
    plainSpores(g);
    const spec = g.actions.seedAt(30, 40)!;
    expect(spec.x).toBe(30);
    expect(spec.radius).toBeCloseTo(13, 6);
    expect(spec.density).toBeGreaterThanOrEqual(0.6);
    expect(spec.density).toBeLessThanOrEqual(0.8);
    expect(spec.noise).toBeGreaterThan(0);
    expect(spec.bias).toBeCloseTo(B.SEED_BIAS_BASE, 6);
    expect(spec.shape).toBe('blob');
    expect(spec.rotation).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(spec.rngSeed)).toBe(true);
    const widths = sporeCandidates({ mu: 0.15, sigma: 0.015, rings: [1] }).map((c) => catalogPattern(c.entry.code).w);
    expect(widths).toContain(spec.pattern!.w);
  });

  it('big seed (Gotero II): radius ×1.5, cost ×2.25', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(4) });
    plainSpores(g);
    const st = g.state as { essence: number; upgrades: Record<string, number>; objective: number };
    st.upgrades.dropper = 2;
    st.essence = 100;
    st.objective = B.OBJECTIVES.length;
    const spec = g.actions.seedAt(10, 10, { big: true })!;
    expect(spec.radius).toBeCloseTo(13 * 1.5, 6);
    expect(100 - g.view().essence).toBeCloseTo(2 * 2.25, 10);
  });

  it('nearest catalog template follows the calibration and the ring profile', () => {
    expect(nearestCatalog({ mu: 0.156, sigma: 0.0224, rings: [1] }).code).toBe('OG2g');
    expect(nearestCatalog({ mu: 0.29, sigma: 0.045, rings: [1] }).code).toBe('S1s');
    expect(nearestCatalog({ mu: 0.15, sigma: 0.015, rings: [0.5, 1, 2 / 3] }).code).toBe('3GH2n');
    expect(nearestCatalog({ mu: 0.15, sigma: 0.015, rings: [1, 1 / 3] }).code).toBe('K4d');
  });

  it('template is rescaled to the current R', () => {
    const e = catalogByCode('O2u')!;
    const p = resamplePattern(catalogPattern('O2u'), 26 / e.R);
    expect(p.w).toBe(Math.round(catalogPattern('O2u').w * 2));
  });

  it('Mutágeno: next 3 seeds are pure template (bias 1, no noise)', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(5) });
    (g.state as { charges: { guaranteed: number }; essence: number }).charges.guaranteed = B.MUTAGEN_SEEDS;
    (g.state as { essence: number }).essence = 1000;
    for (let i = 0; i < 3; i++) {
      const s = g.actions.seedAt(20 + 64 * i, 20)!;
      expect(s.bias).toBe(1);
      expect(s.noise).toBe(0);
      expect(s.shape).toBe('pattern');
    }
    g.tick(B.SEED_SPACING_MEMORY + 0.1, report([])); // the nursery empties
    expect(g.actions.seedAt(60, 140)!.bias).toBeLessThan(1);
  });

  it('emergency pipette: free seed after 10 s when broke and nothing lives', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(6) });
    plainSpores(g);
    g.actions.seedAt(5, 5);
    (g.state as { essence: number }).essence = 0; // broke
    run(g, B.RECENT_SEED_MEMORY + 0.5, report([])); // recent seeds expire first
    expect(g.view().pipette.progress).toBeLessThan(1);
    run(g, 10, report([]));
    expect(g.view().pipette.progress).toBe(1);
    expect(g.view().canSeed).toBe(true);
    expect(g.actions.seedAt(5, 5)).not.toBeNull();
    expect(g.view().pipette.progress).toBe(0);
    expect(g.state.flags.pipetteUsed).toBe(true);
  });

  it('invisible help raises the bias after 3 min without a stable creature', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(7) });
    plainSpores(g);
    (g.state as { essence: number }).essence = 1000;
    const b0 = g.actions.seedAt(1, 1)!.bias!;
    run(g, B.SEED_HELP_DELAY + 1, report([]), 0.5);
    const b1 = g.actions.seedAt(1, 1)!.bias!;
    expect(b1).toBeGreaterThan(b0);
    g.tick(B.SEED_SPACING_MEMORY + 0.1, report([creature({ id: 1, x: 120, y: 150 })]));
    expect(g.actions.seedAt(1, 1)!.bias!).toBeCloseTo(b0, 10);
  });

  it('auto-seeder picks a spot farther than 3R from every creature (wrap-aware) and pays', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(8), grid: { w: 192, h: 240 } });
    const st = g.state as { essence: number; upgrades: Record<string, number>; unlocked: string[] };
    st.upgrades.autoSeeder = 1;
    st.essence = 1000;
    const cs = [creature({ id: 1, x: 10, y: 10 }), creature({ id: 2, x: 100, y: 120 })];
    run(g, B.AUTOSEED_INTERVAL + 0.5, report(cs));
    const seeds = (log.get('dishSeed') ?? []) as { specs: { x: number; y: number }[] }[];
    expect(seeds.length).toBe(1);
    const { x, y } = seeds[0].specs[0];
    for (const c of cs) {
      let dx = Math.abs(x - c.x);
      let dy = Math.abs(y - c.y);
      dx = Math.min(dx, 192 - dx);
      dy = Math.min(dy, 240 - dy);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(3 * 13);
    }
    expect(g.view().essence).toBeLessThan(1000 + 25 * 3);
  });

  it('print costs Muestras and returns the captured portrait at bias 1', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(9), catalogSignatures: [] });
    g.tick(0.5, report([creature({ id: 1 })]));
    const sp = g.view().species[0];
    expect(g.actions.printAt(sp.id, 10, 10)).toBeNull(); // no portrait, not a catalog species
    // A disc of matter in a 30×30 capture, plus a speck of debris in a corner.
    const data = new Float32Array(30 * 30);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (Math.hypot(x + 0.5 - 15, y + 0.5 - 15) < 8) data[y * 30 + x] = 0.5;
    data[1 * 30 + 1] = 0.6;
    g.setSpeciesPortrait(sp.id, { w: 30, h: 30, data });
    const samples = g.view().samples;
    const spec = g.actions.printAt(sp.id, 10, 10)!;
    expect(spec.shape).toBe('pattern');
    expect(spec.bias).toBe(1);
    // Prints stamp the stored capture: the creature alone (debris removed), tightly framed.
    expect(spec.pattern!.w).toBe(g.state.species[0].portrait!.w);
    expect(spec.pattern!.w).toBeLessThan(30);
    const sum = (a: Float32Array) => a.reduce((m, v) => m + v, 0);
    expect(sum(spec.pattern!.data) / (sum(data) - 0.6)).toBeCloseTo(1, 2); // 8-bit save quantisation
    expect(g.view().samples).toBe(samples - sp.printCost);
  });

  it('a revealed catalog species without portrait prints its catalog template', () => {
    const { bus } = recordingBus();
    const g = createGame({
      bus,
      rng: seededRng(10),
      catalogSignatures: [{ code: 'O2u', name: 'Orbium unicaudatus', signature: [1, 1, 1, 1], mu: 0.15, sigma: 0.015, R: 13 }],
    });
    g.tick(0.5, report([creature({ id: 1, signature: [1, 1, 1, 1] })]));
    const sp = g.view().species[0];
    expect(sp.catalogName).toBe('Orbium unicaudatus');
    expect(sp.rarity).toBe('common');
    const spec = g.actions.printAt(sp.id, 10, 10)!;
    expect(spec.pattern!.w).toBe(catalogPattern('O2u').w);
  });
});

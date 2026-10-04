import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { costForQty, levelCost, maxAffordable, UPGRADE_BY_ID, UPGRADES } from './defs';
import { createGame } from './game';
import { creature, recordingBus, report, seededRng } from './testUtil';

describe('upgrade costs', () => {
  it('geometric cost b·g^n and series sum', () => {
    const def = UPGRADE_BY_ID.culture;
    expect(levelCost(def, 0)).toBe(B.CULTURE_BASE);
    expect(levelCost(def, 3)).toBe(Math.ceil(B.CULTURE_BASE * B.CULTURE_GROWTH ** 3));
    let sum = 0;
    for (let i = 5; i < 15; i++) sum += levelCost(def, i);
    expect(costForQty(def, 5, 10)).toBe(sum);
  });

  it('fixed cost lists and caps', () => {
    const def = UPGRADE_BY_ID.dropper;
    expect([0, 1, 2, 3, 4].map((l) => levelCost(def, l))).toEqual(B.DROPPER_COSTS);
    expect(levelCost(def, 5)).toBe(Infinity);
    expect(costForQty(def, 3, 10)).toBe(Infinity);
  });

  it('×max never leaves a negative balance, for every upgrade and many budgets/levels', () => {
    for (const def of UPGRADES) {
      for (const budget of [0, 1, 7.5, 15, 99, 1234.5, 1e5, 3.3e7, 1e12]) {
        for (const lvl of [0, 1, 4, 9, 30]) {
          if (def.maxLevel !== null && lvl > def.maxLevel) continue;
          const k = maxAffordable(def, lvl, budget);
          expect(k).toBeGreaterThanOrEqual(0);
          const c = costForQty(def, lvl, k);
          expect(c).toBeLessThanOrEqual(budget);
          // …and it is maximal.
          if (def.maxLevel === null || lvl + k < def.maxLevel) expect(costForQty(def, lvl, k + 1)).toBeGreaterThan(budget);
        }
      }
    }
  });

  it('buyUpgrade ×1 / ×10 / ×max through the game never goes negative', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1) });
    const st = g.state as { essence: number; unlocked: string[] };
    st.unlocked.push('culture');
    st.essence = 777.7;
    expect(g.actions.buyUpgrade('culture', 10)).toBe(false); // 10 levels unaffordable
    expect(g.actions.buyUpgrade('culture', 'max')).toBe(true);
    expect(g.view().essence).toBeGreaterThanOrEqual(0);
    expect(g.view().essence).toBeLessThan(levelCost(UPGRADE_BY_ID.culture, g.state.upgrades.culture));
    expect(g.actions.buyUpgrade('culture', 'max')).toBe(false);
    expect(count('upgradeBought')).toBe(1);
  });

  it('locked upgrades cannot be bought; unlocks are sticky and toast', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2) });
    (g.state as { essence: number }).essence = 1e6;
    expect(g.actions.buyUpgrade('autoSeeder', 1)).toBe(false);
    g.tick(0.5, report([creature({ id: 1, x: 10 }), creature({ id: 2, x: 100 })]));
    expect(g.view().upgrades.find((u) => u.id === 'autoSeeder')!.unlocked).toBe(true);
    g.tick(0.5, report([]));
    expect(g.view().upgrades.find((u) => u.id === 'autoSeeder')!.unlocked).toBe(true);
    expect(count('toast')).toBeGreaterThan(0);
    expect(g.actions.buyUpgrade('autoSeeder', 1)).toBe(true);
  });

  it('view: qty and cost follow the buy selector', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(3) });
    const [c0, c1, c2] = B.DROPPER_COSTS;
    (g.state as { essence: number }).essence = c0 + c1 + c2 / 2;
    const dropper = () => g.view().upgrades.find((u) => u.id === 'dropper')!;
    expect(dropper().qty).toBe(1);
    expect(dropper().cost).toBe(c0);
    g.actions.setBuyQty(10);
    expect(dropper().qty).toBe(5);
    expect(dropper().affordable).toBe(false);
    g.actions.setBuyQty('max');
    expect(dropper().qty).toBe(2);
    expect(dropper().cost).toBe(c0 + c1);
    expect(dropper().affordable).toBe(true);
  });

  it('Calibrador gates slider ranges and regimes', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(4) });
    expect(g.view().calibration.muRange).toBeNull();
    g.actions.setCalibration({ mu: 0.3 });
    expect(g.simParams.mu).toBe(0.15);
    const st = g.state as { upgrades: Record<string, number> };
    st.upgrades.calibrator = 1;
    g.actions.setCalibration({ mu: 0.3, sigma: 0.02 });
    expect(g.simParams.mu).toBe(B.CALIBRATOR_RANGES[1].mu![1]);
    expect(g.simParams.sigma).toBe(0.02);
    expect(count('calibrationChanged')).toBe(1);
    expect(g.actions.saveRegime('a')).toBe(false);
    st.upgrades.calibrator = 2;
    expect(g.actions.saveRegime('a')).toBe(true);
    g.actions.setCalibration({ mu: 0.29, sigma: 0.045 });
    g.actions.loadRegime(0);
    expect(g.simParams.mu).toBeCloseTo(0.18, 10);
    expect(g.view().calibration.maxRegimes).toBe(8);
  });

  it('ring presets need Anillos dobles/triples', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(5) });
    expect(g.view().calibration.ringsOptions).toBeNull();
    g.actions.setRings!([0.5, 1]);
    expect(g.simParams.rings).toEqual([1]);
    const st = g.state as { genome: number };
    st.genome = 100;
    expect(g.actions.buyGenomeNode('doubleRings')).toBe(true);
    expect(g.view().calibration.ringsOptions!.length).toBe(3);
    g.actions.setRings!([1, 1 / 3]);
    expect(g.simParams.rings).toEqual([1, 1 / 3]);
    expect(g.simParams.R).toBe(18);
  });
});

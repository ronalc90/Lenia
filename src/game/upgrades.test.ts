/**
 * Classic Era loop (Laboratorio, Calibrar, Genoma, Extinción): no player reaches it any more (createGame's
 * default is the sessions cycle, ADR-026, which migrates old classic saves); the code is still there and is tested
 * here explicitly with `cycle: 'classic'` until it is deleted (ADR-028). The sessions cycle has its own tests (sessions.test.ts,
 * spacing.test.ts, dish.test.ts, tests/unit/ranking-sessions.test.ts…).
 */
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
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(1) });
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
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(2) });
    (g.state as { essence: number }).essence = 1e6;
    expect(g.actions.buyUpgrade('autoSeeder', 1)).toBe(false);
    g.tick(0.5, report([creature({ id: 1, x: 10 }), creature({ id: 2, x: 100 })]));
    expect(g.view().upgrades.find((u) => u.id === 'autoSeeder')!.unlocked).toBe(true);
    g.tick(0.5, report([]));
    expect(g.view().upgrades.find((u) => u.id === 'autoSeeder')!.unlocked).toBe(true);
    // No "new upgrade" toast: the Lab is gone from the player's view (CLARIDAD B-11).
    expect(count('toast')).toBe(0);
    expect(g.actions.buyUpgrade('autoSeeder', 1)).toBe(true);
  });

  it('view: qty and cost follow the buy selector', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(3) });
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
});

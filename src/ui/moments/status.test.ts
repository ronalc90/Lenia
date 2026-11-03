import { describe, expect, it } from 'vitest';
import type { CreatureView } from '../../core/types';
import { STATUS_MAX } from '../../moments/config';
import { pickPills, pickStatusIds, PILLS_MAX, placePill, statusInfo, STATUS_LED, LABEL_INK } from './status';

function cv(id: number, state: CreatureView['state'], age = 500, over: Partial<CreatureView> = {}): CreatureView {
  return { id, x: id * 10, y: 50, r: 8, state, behavior: null, speciesId: null, speciesName: null, eps: state === 'stable' ? 1.2 : 0, age, ...over };
}

describe('creature status pills: what they say', () => {
  it('forming creatures show their progress to stable (~400 steps)', () => {
    const es = statusInfo(cv(1, 'born', 250), 'es');
    expect(es.label).toBe('Naciendo');
    expect(es.detail).toBe('62 %');
    expect(es.progress).toBeCloseTo(0.625);
    expect(statusInfo(cv(1, 'born', 250), 'en').label).toBe('Hatching');
    expect(statusInfo(cv(1, 'born', 250), 'en').detail).toBe('62%');
    // Never shows 100 % while still forming.
    expect(statusInfo(cv(1, 'born', 9999), 'es').detail).toBe('99 %');
  });

  it('stable creatures show what they earn and their behaviour', () => {
    const s = statusInfo(cv(1, 'stable', 900, { eps: 1.2, behavior: 'swimmer' }), 'es');
    expect(s.label).toBe('Viva');
    expect(s.detail).toBe('+1/s'); // rates ≥ 1 in whole numbers (docs/CLARIDAD2.md §2.13)
    expect(s.behavior).toBe('swimmer');
    expect(statusInfo(cv(1, 'stable', 900, { eps: 0.4 }), 'en').detail).toBe('+0.4/s'); // under 1: one decimal
  });

  it('accidents read plainly in both languages (no scary words)', () => {
    expect(statusInfo(cv(1, 'exploded'), 'es').label).toBe('Sin forma');
    expect(statusInfo(cv(1, 'exploded'), 'en').label).toBe('Shapeless');
    expect(statusInfo(cv(1, 'dead'), 'es').label).toBe('Se apaga…');
    expect(statusInfo(cv(1, 'dead'), 'en').label).toBe('Fading…');
  });
});

describe('creature status pills: which creatures', () => {
  it('only the tapped one when labels are not on every creature', () => {
    const cs = [cv(1, 'stable'), cv(2, 'born', 100)];
    expect(pickStatusIds(cs, { onAll: false, selectedId: 1 })).toEqual([{ id: 1, alpha: 1 }]);
    expect(pickStatusIds(cs, { onAll: false, selectedId: null })).toEqual([]);
  });

  it('at most six on a crowded dish, always the tapped one, forming and accidents first', () => {
    const cs: CreatureView[] = [];
    for (let i = 1; i <= 12; i++) cs.push(cv(i, 'stable', 900 + i * 100));
    cs.push(cv(50, 'born', 100), cv(51, 'exploded'), cv(52, 'dead'));
    const picked = pickStatusIds(cs, { onAll: true, selectedId: 12 });
    expect(picked).toHaveLength(STATUS_MAX);
    const ids = picked.map((p) => p.id);
    expect(ids).toContain(12);
    expect(ids).toEqual(expect.arrayContaining([50, 51, 52]));
    // Crowded: the others are a little faded, the tapped one is not.
    expect(picked.find((p) => p.id === 12)?.alpha).toBe(1);
    expect(picked.find((p) => p.id === 50)?.alpha).toBeLessThan(1);
  });

  it('a calm dish labels everyone at full strength', () => {
    const picked = pickStatusIds([cv(1, 'stable'), cv(2, 'born', 10)], { onAll: true, selectedId: null });
    expect(picked.every((p) => p.alpha === 1)).toBe(true);
  });
});

describe('creature status pills: placement', () => {
  const view = { w: 360, h: 400 };
  it('goes above the creature, or below when there is no room', () => {
    const a = placePill(180, 200, 20, 100, 22, [], view);
    expect(a.below).toBe(false);
    expect(a.y + a.h).toBeLessThan(200 - 20);
    const b = placePill(180, 20, 20, 100, 22, [], view);
    expect(b.below).toBe(true);
  });

  it('two neighbours do not overlap and pills stay on screen', () => {
    const taken = [placePill(180, 200, 20, 100, 22, [], view)];
    const b = placePill(190, 205, 20, 100, 22, taken, view);
    const a = taken[0];
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(overlap).toBe(false);
    const edge = placePill(355, 200, 10, 120, 22, [], view);
    expect(edge.x + edge.w).toBeLessThanOrEqual(view.w - 4);
  });

  it('with no free spot a pill waits instead of covering another (one label at a time)', () => {
    const cover = [{ x: 0, y: 0, w: view.w, h: view.h }];
    expect(placePill(180, 200, 20, 100, 22, cover, view).blocked).toBe(true);
    expect(placePill(180, 200, 20, 100, 22, [], view).blocked).toBeUndefined();
  });
});

describe('one rate before the first seed (RF-10)', () => {
  it('while the clock waits a living creature shows no rate (the HUD says +0/s: nothing is earned yet)', () => {
    const waiting = statusInfo(cv(1, 'stable', 900, { eps: 2 }), 'es', undefined, false);
    expect(waiting.label).toBe('Viva');
    expect(waiting.detail).toBeNull();
    expect(statusInfo(cv(1, 'stable', 900, { eps: 2 }), 'es', undefined, true).detail).toBe('+2/s');
  });
});

describe('the LIFE card drawing says the creature\'s own rate (RF-10)', () => {
  it('no rate while the clock waits, the real rate while it runs, the generic +1/s only in a replay', async () => {
    const { liveRateBadge } = await import('./illustrations');
    expect(liveRateBadge(0, 'es')).toBeNull();
    expect(liveRateBadge(2, 'es')).toBe('+2/s');
    expect(liveRateBadge(undefined, 'en')).toBe('+1/s');
  });
});

describe('quiet dish labels (B-8)', () => {
  it('no pill by default: only after an event, for 2.5 s', () => {
    const cs = [cv(1, 'stable'), cv(2, 'stable'), cv(3, 'born', 50)];
    expect(pickPills(cs, new Map(), 10, { onAll: false, earning: true })).toEqual([]);
    const ev = new Map([[2, 9]]);
    expect(pickPills(cs, ev, 10, { onAll: false, earning: true })).toEqual([{ id: 2, compact: false }]);
    expect(pickPills(cs, ev, 11.6, { onAll: false, earning: true })).toEqual([]);
  });

  it('never more than 2 on screen, newest events first, forming creatures never (the arc says it)', () => {
    const cs = [cv(1, 'stable'), cv(2, 'exploded'), cv(3, 'dead'), cv(4, 'born', 300)];
    const ev = new Map([
      [1, 9.0],
      [2, 9.5],
      [3, 9.8],
      [4, 9.9],
    ]);
    const p = pickPills(cs, ev, 10, { onAll: true, earning: true });
    expect(p.map((x) => x.id)).toEqual([3, 2]);
    expect(p.length).toBeLessThanOrEqual(PILLS_MAX);
  });

  it('Era 1 with labels on: compact pills on the best earners, only while the clock runs', () => {
    const cs = [{ ...cv(1, 'stable'), eps: 1 }, { ...cv(2, 'stable'), eps: 3 }, { ...cv(3, 'stable'), eps: 2 }];
    expect(pickPills(cs, new Map(), 10, { onAll: true, earning: true })).toEqual([
      { id: 2, compact: true },
      { id: 3, compact: true },
    ]);
    expect(pickPills(cs, new Map(), 10, { onAll: true, earning: false })).toEqual([]);
  });
});

describe('status pills are instrument labels with an LED (docs/ARTE-REALISTA.md §6.9)', () => {
  it('alive is a fixed green LED, forming a ring that fills, shapeless amber, fading grey', () => {
    expect(STATUS_LED.stable).toMatchObject({ shape: 'dot', blink: false });
    expect(STATUS_LED.born.shape).toBe('ring');
    expect(STATUS_LED.exploded.shape).toBe('dot');
    expect(STATUS_LED.dead.shape).toBe('dot');
    expect(new Set([STATUS_LED.stable.color, STATUS_LED.exploded.color, STATUS_LED.dead.color]).size).toBe(3);
    // A 6-px LED: the label never shouts in colour, the light does.
    for (const k of ['born', 'stable', 'exploded', 'dead'] as const) expect(STATUS_LED[k].size).toBe(6);
    expect(LABEL_INK).toMatch(/^#/);
  });
});

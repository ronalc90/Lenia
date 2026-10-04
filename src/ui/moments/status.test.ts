import { describe, expect, it } from 'vitest';
import type { CreatureView } from '../../core/types';
import { STATUS_MAX } from '../../moments/config';
import { pickStatusIds, placePill, statusInfo } from './status';

function cv(id: number, state: CreatureView['state'], age = 500, over: Partial<CreatureView> = {}): CreatureView {
  return { id, x: id * 10, y: 50, r: 8, state, behavior: null, speciesId: null, speciesName: null, eps: state === 'stable' ? 1.2 : 0, age, ...over };
}

describe('creature status pills: what they say', () => {
  it('forming creatures show their progress to stable (~400 steps)', () => {
    const es = statusInfo(cv(1, 'born', 250), 'es');
    expect(es.label).toBe('Naciendo');
    expect(es.detail).toBe('62 %');
    expect(es.progress).toBeCloseTo(0.625);
    expect(statusInfo(cv(1, 'born', 250), 'en').label).toBe('Forming');
    expect(statusInfo(cv(1, 'born', 250), 'en').detail).toBe('62%');
    // Never shows 100 % while still forming.
    expect(statusInfo(cv(1, 'born', 9999), 'es').detail).toBe('99 %');
  });

  it('stable creatures show what they earn and their behaviour', () => {
    const s = statusInfo(cv(1, 'stable', 900, { eps: 1.2, behavior: 'swimmer' }), 'es');
    expect(s.label).toBe('Estable');
    expect(s.detail).toBe('+1,2/s');
    expect(s.behavior).toBe('swimmer');
    expect(statusInfo(cv(1, 'stable', 900, { eps: 1.2 }), 'en').detail).toBe('+1.2/s');
  });

  it('accidents read plainly in both languages', () => {
    expect(statusInfo(cv(1, 'exploded'), 'es').label).toBe('Explotó');
    expect(statusInfo(cv(1, 'exploded'), 'en').label).toBe('Exploded');
    expect(statusInfo(cv(1, 'dead'), 'es').label).toBe('Se disuelve…');
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
});

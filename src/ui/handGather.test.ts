/**
 * Code review v0.027 #4: a tap on empty agar next to four loose drops counted four hits of the streak (and four towards
 * the Chispazo), and a sweep across a dish full of drops filled the streak without touching a creature. One gesture is
 * one hit at most (docs/MECANICAS.md §3.1): the ripple asks the game once, the sweep's drops add none.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import { createGame } from '../game/game';
import { creature, recordingBus, report, run, seededRng } from '../game/testUtil';
import { HandGather } from './handGather';

/** A running session with four loose drops around grid (60, 60): four creatures went dark there. */
function looseDrops() {
  const rec = recordingBus();
  let ms = 0;
  const g = createGame({ bus: rec.bus, rng: seededRng(1), cycle: 'sessions', now: () => ms }, undefined);
  g.actions.startClock!();
  const at = [
    [54, 60],
    [66, 60],
    [60, 54],
    [60, 66],
  ];
  run(g, 2, report(at.map(([x, y], i) => creature({ id: i + 1, x, y, radius: 3 }))), 0.5);
  g.tick(0.1, report([]));
  const drops = g.view().drops!.filter((d) => d.owner === null);
  expect(drops).toHaveLength(4);
  return { g, ...rec, sum: drops.reduce((a, d) => a + d.amount, 0), advance: (s: number) => void (ms += s * 1000) };
}

/** Overlay px are 2 × grid cells. */
const cam = { scale: 2, screenToGrid: (px: number, py: number) => ({ x: px / 2, y: py / 2 }) };

describe('one gesture of the finger is one hit at most', () => {
  it('a tap on empty agar gathers every drop in reach for one hit of the streak', () => {
    const t = looseDrops();
    const hand = new HandGather(() => t.g.actions, cam);
    const live: boolean[] = [];
    t.bus.on('lightCollected', () => live.push(hand.active));
    expect(hand.ripple(120, 120, 48)).toBeCloseTo(t.sum, 9);
    expect(t.g.view().drops!.filter((d) => d.owner === null)).toHaveLength(0);
    expect(t.g.view().streak!.hits).toBe(1);
    expect(t.g.view().streak!.toChispazo).toBe(t.g.view().streak!.every - 1);
    // The UI draws in each drop the game names while it answers.
    expect(live).toEqual([true, true, true, true]);
    expect(hand.active).toBe(false);
  });

  it('a sweep across loose drops collects them and adds no hit (its hits are the creatures it crosses)', () => {
    const t = looseDrops();
    const hand = new HandGather(() => t.g.actions, cam);
    let got = hand.sweep(80, 108, 160, 108, 16) + hand.sweep(160, 108, 160, 132, 16) + hand.sweep(160, 132, 80, 132, 16);
    got += hand.sweep(80, 132, 80, 108, 16);
    expect(got).toBeCloseTo(t.sum, 9);
    expect(((t.log.get('lightCollected') ?? []) as GameEvents['lightCollected'][]).every((e) => e.by === 'hand')).toBe(true);
    expect(t.g.view().streak?.hits ?? 0).toBe(0);
  });

  it('a tap with nothing in reach collects nothing and keeps the streak', () => {
    const t = looseDrops();
    const hand = new HandGather(() => t.g.actions, cam);
    expect(hand.ripple(10, 10, 48)).toBe(0);
    expect(t.g.view().streak?.hits ?? 0).toBe(0);
    expect(t.g.view().drops!.filter((d) => d.owner === null)).toHaveLength(4);
  });
});

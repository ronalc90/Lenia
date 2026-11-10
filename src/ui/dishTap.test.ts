import { describe, expect, it } from 'vitest';
import {
  CARD_TAP_QUIET_MS,
  cardHoldOk,
  dropsOnSegment,
  motesOnSegment,
  pillTapRoute,
  routeTap,
  SweepHits,
  SWEEP_REHIT_S,
  TAP_REACH_PX,
  type TapCreature,
  type TapDrop,
  type TapMote,
  type TapReach,
  type TapScene,
} from './dishTap';

function scene(drops: TapDrop[], creatures: TapCreature[], collecting = true, motes: TapMote[] = [], pulsing = false): TapScene {
  return {
    drops,
    dropCount: drops.length,
    creatures,
    creatureCount: creatures.length,
    collecting,
    dropPx: 32,
    creaturePadPx: 16,
    pulsing,
    motes,
    moteCount: motes.length,
    motePx: 36,
    reachPx: TAP_REACH_PX,
  };
}
/** A session dish (ADR-031): the game pulses creatures and a finger never sows. */
const session = (drops: TapDrop[], creatures: TapCreature[], motes: TapMote[] = []) => scene(drops, creatures, true, motes, true);
const orbium = (id: number, x: number, y: number, behavior: TapCreature['behavior'] = 'swimmer'): TapCreature => ({ id, x, y, r: 24, state: 'stable', behavior });
const forming = (id: number, x: number, y: number): TapCreature => ({ id, x, y, r: 20, state: 'born', behavior: null });
const blob = (id: number, x: number, y: number): TapCreature => ({ id, x, y, r: 30, state: 'exploded', behavior: null });
const drop = (id: number, x: number, y: number, owner: number | null = null, amount = 5): TapDrop => ({ id, x, y, amount, owner });
const mote = (id: number, x: number, y: number): TapMote => ({ id, x, y });
const reach = (): TapReach => ({ drops: [], dropN: 0, motes: [], moteN: 0 });

describe('a finger on the dish (dishTap.ts, ADR-030 §2.2.1)', () => {
  it('a tap on a drop collects and never sows', () => {
    const s = scene([drop(7, 100, 100)], []);
    expect(routeTap('tap', 100, 100, s)).toEqual({ kind: 'collect', drop: 7, creature: null });
    // 30 px away is still on it (a 64 px target, above the 48 px minimum).
    expect(routeTap('tap', 130, 100, s).kind).toBe('collect');
    // Empty agar further away: a seed, as always.
    expect(routeTap('tap', 200, 100, s)).toEqual({ kind: 'sow', big: false });
    // An empty drop (collected a moment ago) is not a target.
    expect(routeTap('tap', 100, 100, scene([drop(7, 100, 100, null, 0)], []))).toEqual({ kind: 'sow', big: false });
  });

  it('a tap on a creature collects its light; a long press opens its card', () => {
    const s = scene([drop(3, 160, 60, 1)], [orbium(1, 100, 100)]);
    // On the body, away from the drop itself: its own drop is collected.
    expect(routeTap('tap', 90, 110, s)).toEqual({ kind: 'collect', drop: 3, creature: 1 });
    expect(routeTap('long', 100, 100, s)).toEqual({ kind: 'card', id: 1 });
    // No light yet: the tap never sows on it; it points at the long press.
    const dry = scene([], [orbium(1, 100, 100)]);
    expect(routeTap('tap', 100, 100, dry)).toEqual({ kind: 'cardHint', id: 1 });
    // A long press on empty agar is the big seed.
    expect(routeTap('long', 300, 300, s)).toEqual({ kind: 'sow', big: true });
    // Without collection (no drops in the view) the short tap still opens the card, as before.
    expect(routeTap('tap', 100, 100, scene([], [orbium(1, 100, 100)], false))).toEqual({ kind: 'card', id: 1 });
  });

  it('a swipe across three drops collects all three', () => {
    const s = scene([drop(1, 50, 100), drop(2, 150, 110), drop(3, 250, 95), drop(4, 150, 300)], []);
    expect(routeTap('drag', 10, 100, s)).toEqual({ kind: 'sweep' });
    const out: number[] = [];
    let n = dropsOnSegment(s, 10, 100, 160, 100, out, 0);
    n = dropsOnSegment(s, 160, 100, 290, 100, out, n);
    // Passing over drop 2 again does not count it twice.
    n = dropsOnSegment(s, 290, 100, 140, 105, out, n);
    expect(out.slice(0, n).sort()).toEqual([1, 2, 3]);
  });

  it('a drag from a swimmer steers it and collects nothing', () => {
    const s = scene([drop(5, 120, 100, 1)], [orbium(1, 100, 100), orbium(2, 300, 300, 'spinner')]);
    expect(routeTap('drag', 105, 100, s)).toEqual({ kind: 'steer', id: 1 });
    // A spinner is not guided: a drag from it is a sweep like any other.
    expect(routeTap('drag', 300, 300, s)).toEqual({ kind: 'sweep' });
    // Without collection a drag from empty agar is left to the brush / eraser.
    expect(routeTap('drag', 10, 10, scene([], [], false))).toEqual({ kind: 'none' });
  });
});

describe('the tap is a pulse (dishTap.ts, ADR-031, MECANICAS §3.1)', () => {
  it('a tap on empty agar never sows', () => {
    const s = session([], [orbium(1, 100, 100)]);
    // Anywhere off the creature: a water ripple, never a seed, however many times.
    for (const [x, y] of [
      [300, 300],
      [20, 200],
      [200, 20],
      [160, 160],
    ])
      expect(routeTap('tap', x, y, s).kind).toBe('ripple');
    // A long press on the agar is no big seed either (it moved to the Sembrar button).
    expect(routeTap('long', 300, 300, s)).toEqual({ kind: 'none' });
    // Nor without drops in the view: a session finger never sows.
    expect(routeTap('tap', 300, 300, scene([], [], false, [], true)).kind).toBe('ripple');
  });

  it('a tap on empty agar gathers the drops and glimmers within reach', () => {
    const s = session([drop(4, 140, 100), drop(5, 400, 400)], [], [mote(9, 100, 145)]);
    const r = reach();
    // 40 px from the drop and 45 px from the glimmer: past their own touch radius, inside the 48 px reach.
    expect(routeTap('tap', 100, 100, s, r).kind).toBe('ripple');
    expect(r.drops.slice(0, r.dropN)).toEqual([4]);
    expect(r.motes.slice(0, r.moteN)).toEqual([9]);
    // Nothing near: only the ripple.
    const far = reach();
    expect(routeTap('tap', 250, 250, s, far).kind).toBe('ripple');
    expect(far.dropN + far.moteN).toBe(0);
  });

  it('a tap on a stable creature is a pulse', () => {
    const s = session([drop(3, 160, 60, 1)], [orbium(1, 100, 100)]);
    // On its body: a pulse, which also takes its own drop (the game's pulse collects it).
    expect(routeTap('tap', 90, 110, s)).toEqual({ kind: 'pulse', id: 1, drop: 3 });
    // On its own drop: the same pulse (the finger went for its light).
    expect(routeTap('tap', 160, 60, s)).toEqual({ kind: 'pulse', id: 1, drop: 3 });
    // With no light yet it is still a pulse: no «mantén pulsado» hint any more.
    expect(routeTap('tap', 100, 100, session([], [orbium(1, 100, 100)]))).toEqual({ kind: 'pulse', id: 1, drop: null });
    // The long press still opens its card.
    expect(routeTap('long', 100, 100, s)).toEqual({ kind: 'card', id: 1 });
    // A loose drop (its creature went dark) is collected as before.
    expect(routeTap('tap', 300, 300, session([drop(8, 300, 300)], [orbium(1, 100, 100)]))).toEqual({ kind: 'collect', drop: 8, creature: null });
  });

  it('a tap on a forming seed is grey and never sows', () => {
    const s = session([], [forming(2, 100, 100), blob(3, 300, 300)]);
    expect(routeTap('tap', 105, 95, s)).toEqual({ kind: 'grey', id: 2 });
    // Shapeless matter too: «aún no brilla», nothing paid, nothing sown.
    expect(routeTap('tap', 300, 300, s)).toEqual({ kind: 'grey', id: 3 });
    // Neither has a card.
    expect(routeTap('long', 100, 100, s)).toEqual({ kind: 'none' });
  });

  it('a glimmer under the finger is caught before the creature behind it', () => {
    const s = session([drop(3, 125, 75, 1)], [orbium(1, 100, 100)], [mote(9, 118, 92)]);
    expect(routeTap('tap', 115, 95, s)).toEqual({ kind: 'catch', mote: 9 });
    // Away from the glimmer, the creature is pulsed as usual.
    expect(routeTap('tap', 85, 115, s).kind).toBe('pulse');
  });

  it('a swipe pulses each creature it crosses once per 0.3 s', () => {
    const s = session([], [orbium(1, 100, 100), orbium(2, 220, 104), forming(3, 340, 100), orbium(4, 220, 300)]);
    expect(routeTap('drag', 10, 100, s)).toEqual({ kind: 'sweep' });
    const hits = new SweepHits();
    const out: number[] = [];
    // Across 1 and 2 (the forming seed 3 and the far 4 are not pulsed).
    let n = hits.cross(s, 10, 100, 400, 100, 0, SWEEP_REHIT_S, out);
    expect(out.slice(0, n).sort()).toEqual([1, 2]);
    // Back over them 0.1 s later: nothing new.
    n = hits.cross(s, 400, 100, 10, 100, 0.1, SWEEP_REHIT_S, out);
    expect(n).toBe(0);
    // Again after 0.3 s: each one once more.
    n = hits.cross(s, 10, 100, 400, 100, 0.31, SWEEP_REHIT_S, out);
    expect(out.slice(0, n).sort()).toEqual([1, 2]);
    // A new sweep starts afresh.
    hits.reset();
    n = hits.cross(s, 90, 100, 110, 100, 0.32, SWEEP_REHIT_S, out);
    expect(out.slice(0, n)).toEqual([1]);
    // A swipe that starts on a swimmer still steers it.
    expect(routeTap('drag', 100, 100, s)).toEqual({ kind: 'steer', id: 1 });
  });

  it('a swipe catches the glimmers on its path', () => {
    const s = session([], [], [mote(1, 50, 100), mote(2, 150, 120), mote(3, 150, 300)]);
    const out: number[] = [];
    let n = motesOnSegment(s, 10, 100, 200, 100, out, 0);
    n = motesOnSegment(s, 200, 100, 10, 100, out, n);
    expect(out.slice(0, n).sort()).toEqual([1, 2]);
  });
});

// QA-3 §2 (v0.026, shots 035, 185): tapping fast, a creature's card «Aún sin nombre / Nadadora celeste · VIVA · Seguir»
// sometimes popped up over 40 % of the dish and the next taps landed on it (once on «Seguir»: it zoomed and followed).
describe('the creature card is a long press only, never during a streak (QA-3 §2)', () => {
  it('QA-3: during a streak a long press on a creature opens nothing (a slow tap counted as a press)', () => {
    const s = { ...session([], [orbium(1, 100, 100)]), streaking: true };
    expect(routeTap('long', 100, 100, s)).toEqual({ kind: 'none' });
  });

  // QA-4 N6 (c1-118, c1-134): before the clock there is no streak, and fast taps on the Nevera's creatures opened its
  // card (and the next tap landed on «Seguir»). A press that starts right after a tap is part of the tapping.
  it('QA-4 N6: a press that starts within a second of a tap never opens the card', () => {
    expect(cardHoldOk(10_000, 9_500)).toBe(false);
    expect(cardHoldOk(10_000, 10_000 - CARD_TAP_QUIET_MS)).toBe(true);
    expect(cardHoldOk(10_000, -Infinity)).toBe(true);
    expect(CARD_TAP_QUIET_MS).toBeGreaterThanOrEqual(800);
  });

  it('without a streak the long press still opens it', () => {
    expect(routeTap('long', 100, 100, { ...session([], [orbium(1, 100, 100)]), streaking: false })).toEqual({ kind: 'card', id: 1 });
  });

  it('QA-3: in a session a tap on a creature\'s pill pulses it; it never opens the card', () => {
    const stable = { state: 'stable' as const, behavior: null };
    expect(pillTapRoute(stable, { pulsing: true, streaking: false, easyPulse: false })).toBe('pulse');
    expect(pillTapRoute(stable, { pulsing: true, streaking: true, easyPulse: false })).toBe('pulse');
    // A behaviour pill explains itself, but not in the middle of a streak (the finger is tapping, not reading).
    expect(pillTapRoute({ state: 'stable', behavior: 'swimmer' }, { pulsing: true, streaking: false, easyPulse: false })).toBe('behavior');
    expect(pillTapRoute({ state: 'stable', behavior: 'swimmer' }, { pulsing: true, streaking: true, easyPulse: false })).toBe('pulse');
  });

  it('«Pulso fácil» keeps the card on the pill (MECANICAS §3.5), but not during a streak; the classic loop as before', () => {
    const stable = { state: 'stable' as const, behavior: null };
    expect(pillTapRoute(stable, { pulsing: true, streaking: false, easyPulse: true })).toBe('card');
    expect(pillTapRoute(stable, { pulsing: true, streaking: true, easyPulse: true })).toBe('pulse');
    expect(pillTapRoute(stable, { pulsing: false, streaking: false, easyPulse: false })).toBe('card');
    expect(pillTapRoute({ state: 'born', behavior: null }, { pulsing: true, streaking: false, easyPulse: false })).toBe('none');
  });
});

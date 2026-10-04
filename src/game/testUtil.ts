/** Helpers for game tests and the balance bot: fake creatures, reports and a seeded RNG. */
import { Bus, type GameEvents } from '../core/bus';
import type { Behavior, Creature, CreatureState, DetectorEvent, DetectorReport } from '../core/types';
import catalogSignatures from '../detect/catalogSignatures.json';

/** Mulberry32 PRNG: deterministic uniform [0,1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Real catalog signature from the detector's reference file, or a hand-made fallback. */
function catalogSig(code: string, fallback: number[]): number[] {
  const e = (catalogSignatures as { code: string; signature?: number[] }[]).find((x) => x.code === code);
  return e?.signature?.length ? [...e.signature] : fallback;
}
export const ORBIUM_SIG = catalogSig('O2u', [1.0, 0.55, 0.3, 0.0, 1.2, 0.05, 1.0, 0.8]);
export const SCUTIUM_SIG = catalogSig('S1s', [2.4, 0.4, 0.1, 0.0, 0.0, 0.0, 1.0, 0.3]);
export const GYRO_SIG = catalogSig('OG2g', [1.3, 0.6, 0.2, 0.0, 0.9, 0.9, 1.0, 0.5]);

export function creature(p: Partial<Creature> & { id: number }): Creature {
  return {
    x: 50,
    y: 50,
    radius: 8,
    mass: 120,
    complexity: 1,
    state: 'stable' as CreatureState,
    behavior: null as Behavior | null,
    age: 600,
    vx: 0,
    vy: 0,
    signature: ORBIUM_SIG,
    parentId: null,
    ...p,
  };
}

export function report(creatures: Creature[], events: DetectorEvent[] = [], step = 0): DetectorReport {
  return { step, creatures, events, totalMass: creatures.reduce((m, c) => m + c.mass, 0), fill: 0.02 };
}

/** A bus that records every event (type → payloads). */
export function recordingBus(): { bus: Bus<GameEvents>; log: Map<keyof GameEvents, unknown[]>; count(t: keyof GameEvents): number } {
  const bus = new Bus<GameEvents>();
  const log = new Map<keyof GameEvents, unknown[]>();
  const orig = bus.emit.bind(bus);
  bus.emit = (type, payload) => {
    let l = log.get(type);
    if (!l) log.set(type, (l = []));
    l.push(payload);
    orig(type, payload);
  };
  return { bus, log, count: (t) => log.get(t)?.length ?? 0 };
}

/** Advance a game by `seconds` in fixed `dt` steps, feeding the same report every step. */
export function run(game: { tick(dt: number, r: DetectorReport | null): void }, seconds: number, rep: DetectorReport | null, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) game.tick(dt, rep);
}

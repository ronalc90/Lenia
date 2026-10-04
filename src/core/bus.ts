import type { Behavior, Rarity, Text } from './types';

/**
 * Game-wide events. The game emits them; UI (juice, toasts) and audio react.
 * Positions are in grid cells.
 */
export interface GameEvents {
  /** A seed was placed (manual = by the player, else by the auto-seeder). */
  seed: { x: number; y: number; cost: number; manual: boolean };
  /** Seeding refused for lack of essence. */
  seedDenied: { x: number; y: number; cost: number };
  creatureBorn: { id: number; x: number; y: number };
  creatureStable: { id: number; x: number; y: number };
  creatureDied: { id: number; x: number; y: number };
  creatureExploded: { id: number; x: number; y: number };
  creatureDivided: { parentId: number; x: number; y: number };
  /** Periodic income popped from a creature (for floating numbers). */
  income: { id: number; x: number; y: number; amount: number };
  speciesNew: { speciesId: string; name: string; rarity: Rarity; x: number; y: number };
  behaviorNew: { behavior: Behavior; x: number; y: number };
  upgradeBought: { id: string; level: number };
  genomeBought: { id: string };
  journalNew: { id: string; text: Text };
  achievement: { id: string; name: Text };
  extinctionStart: { genome: number };
  extinctionDone: { era: number; genome: number };
  goldenSpawn: { x: number; y: number };
  goldenCollected: { x: number; y: number; reward: Text };
  goldenMissed: Record<string, never>;
  calibrationChanged: { mu: number; sigma: number; R: number; dt: number };
  offlineReturn: { seconds: number; essence: number };
  toast: { text: Text; kind: 'info' | 'good' | 'warn' | 'bad' };
  /** The dish flooded with shapeless matter (on) or recovered (off). */
  dishOvergrown: { on: boolean };
  /** Ask the dish to be cleared (extinction, load). */
  dishClear: Record<string, never>;
  /** Ask the dish to apply seeds (auto-seeder, golden reward). */
  dishSeed: { specs: import('./types').SeedSpec[] };
}

type Handler<T> = (payload: T) => void;

export class Bus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<E[K]>)(payload);
      } catch (err) {
        console.error(`[bus] handler for "${String(type)}" failed`, err);
      }
    }
  }
}

/** The single app-wide bus. */
export const bus = new Bus<GameEvents>();

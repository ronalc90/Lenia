import type { Behavior, Rarity, Text } from './types';

/**
 * Game-wide events. The game emits them; UI (juice, toasts) and audio react.
 * Positions are in grid cells.
 */
export interface GameEvents {
  /**
   * A seed was placed (manual = by the player, else by the auto-seeder). (game) `from` = where the
   * player tapped when the seed was moved to the nearest spot with room (spacing rule).
   */
  seed: { x: number; y: number; cost: number; manual: boolean; from?: { x: number; y: number } };
  /**
   * (game) A tap was refused, nothing charged: 'tooClose' = no room there (it would fuse with nearby
   * matter); 'growing' = enough seeds are still forming ("⏳ Espera…", GameView.seedsGrowing);
   * 'full' = (sessions) the dish has no room left ("Placa llena: mejora la Placa para más sitio").
   */
  /** `near` (tooClose): the body in the way, in grid cells, for the red ring. */
  seedBlocked: { x: number; y: number; reason: 'tooClose' | 'growing' | 'full'; near?: { x: number; y: number; r: number } };
  /** Seeding refused for lack of essence. */
  seedDenied: { x: number; y: number; cost: number };
  creatureBorn: { id: number; x: number; y: number };
  creatureStable: { id: number; x: number; y: number };
  creatureDied: { id: number; x: number; y: number };
  /** (game) Exploded matter vanished (lysis, clean-up): not a death of a creature. */
  creatureDissolved: { id: number; x: number; y: number };
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
  // ── (game, sessions cycle: docs/CICLO.md) ──
  /** A new session is set up on a fresh dish (start card); its clock waits for the first seed. */
  sessionStart: { n: number; world: string; seconds: number };
  /** Clock moments: started, last minute, amber warning, each of the last 10 s, sprint. */
  sessionClock: { type: 'clockStart' | 'lastMinute' | 'warn' | 'countdown' | 'sprint'; seconds?: number };
  /** Seconds added to the clock ("+5 s"). */
  sessionExtended: { seconds: number; reason: 'species' | 'encargo' | 'golden' };
  /** Time is up (or "Terminar ahora"): the Datos are banked; Game.lastSummary holds the end card. */
  sessionEnd: { n: number; datos: number; essence: number; nightReady: boolean; early: boolean };
  /** A research-tree level was bought. `revealed` = nodes that became visible (reveal animation). */
  nodeBought: { id: string; level: number; cost: number; revealed: string[] };
  /** The tree centre was bought: a new night (story era) begins. */
  nightStart: { night: number };
  /** The world of the next session changed. */
  worldPicked: { world: string };
  /** An Abono was bought. */
  boostBought: { count: number; mult: number; cost: number };
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

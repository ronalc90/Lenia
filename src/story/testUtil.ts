/** Test helpers: a minimal, complete GameView and an in-memory storage. */
import type { Behavior, CreatureView, GameView, GenomeNodeView, SpeciesView } from '../core/types';
import type { StorageLike } from './types';

export function makeView(over: Partial<GameView> = {}): GameView {
  const base: GameView = {
    essence: 20,
    essencePerSec: 0,
    samples: 0,
    genome: 0,
    era: 1,
    seedCost: 2,
    canSeed: true,
    pipette: { active: false, progress: 0 },
    tools: { longPress: false, brush: false, eraser: true, speeds: [1], speed: 1 },
    upgrades: [
      {
        id: 'dropper',
        tab: 'lab',
        name: { es: 'Gotero', en: 'Dropper' },
        desc: { es: '', en: '' },
        effect: { es: '', en: '' },
        level: 0,
        maxLevel: 5,
        cost: 15,
        qty: 1,
        currency: 'essence',
        affordable: false,
        unlocked: true,
        unlockHint: { es: '', en: '' },
        maxed: false,
      },
    ],
    genomeNodes: [],
    species: [],
    behaviorsSeen: [],
    calibration: {
      mu: 0.15,
      sigma: 0.015,
      R: 13,
      dt: 0.1,
      muRange: null,
      sigmaRange: null,
      RRange: null,
      dtRange: null,
      regimes: [],
      maxRegimes: 0,
    },
    journal: [],
    achievements: [],
    extinction: { available: false, genomeGain: 0, gainIn10Min: 0, requirement: { es: '', en: '' }, progress: 0 },
    golden: null,
    buffs: [],
    creatures: [],
    objective: null,
    settings: {
      lang: 'es',
      sfxVolume: 1,
      musicVolume: 1,
      muted: false,
      vibration: true,
      reduceMotion: false,
      oneTouch: false,
      quality: 'auto',
      analytics: false,
    },
    tabs: { lab: false, bestiary: false, calibrate: false, genome: false },
    stats: { playTime: 0, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 },
  };
  return { ...base, ...over };
}

export function species(name: string, mult = 1.1, isNew = true): SpeciesView {
  return {
    id: name,
    name,
    catalogName: name,
    rarity: 'common',
    behavior: null,
    mult,
    timesSeen: 1,
    era: 1,
    portrait: null,
    muRange: [0.15, 0.15],
    sigmaRange: [0.015, 0.015],
    printCost: 1,
    isNew,
  };
}

export function creature(id: number, state: CreatureView['state'] = 'stable', x = 50, y = 50): CreatureView {
  return { id, x, y, r: 10, state, behavior: null, speciesId: null, speciesName: null, eps: 1, age: 500 };
}

export function node(id: string, branch: GenomeNodeView['branch'], owned: boolean): GenomeNodeView {
  return {
    id,
    branch,
    name: { es: id, en: id },
    desc: { es: '', en: '' },
    cost: 1,
    owned,
    available: true,
    affordable: true,
    requires: [],
  };
}

export const ALL_BEHAVIORS: Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];

export function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

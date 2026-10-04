/**
 * Mock game for ui-dev.html: a rich, moving GameView (upgrades, species with
 * real catalog portraits, creatures, golden spark, buffs) and GameActions that
 * emit bus events, so every piece of UI juice can be exercised without the
 * real simulation. Dev-only; not used by the shipped game.
 */
import { bus } from '../core/bus';
import { mod } from '../core/camera';
import type {
  AchievementView,
  Behavior,
  BuyQty,
  CreatureView,
  GameActions,
  GameView,
  GenomeNodeView,
  JournalEntryView,
  LeniaParams,
  Pattern,
  Rarity,
  SeedSpec,
  Settings,
  SpeciesView,
  Text,
  UpgradeView,
} from '../core/types';
import { catalogPattern } from '../sim/catalog';
import type { LeaderboardBoard, LeaderboardClient, LeaderboardEntry, LeaderboardResult } from './leaderboard-types';
import { validateNickname } from './leaderboard-types';

/** Mock simulation rate: steps per second at speed ×1 (velocities are per step). */
export const MOCK_STEPS_PER_SEC = 30;

const T = (es: string, en: string): Text => ({ es, en });

interface MockUpgrade {
  id: string;
  tab: 'lab' | 'bestiary';
  name: Text;
  desc: Text;
  effect: (lvl: number) => Text;
  base: number;
  growth: number;
  maxLevel: number | null;
  level: number;
  unlocked: boolean;
  unlockHint: Text;
  currency: 'essence' | 'samples';
}

interface MockCreature {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  r: number;
  state: CreatureView['state'];
  behavior: Behavior | null;
  speciesId: string | null;
  eps: number;
  age: number;
  bornAt: number;
  fate: 'stable' | 'die' | 'explode';
  incomeAt: number;
  heading: number;
}

export interface MockSpecies extends SpeciesView {
  code: string;
}

const SPECIES_DEF: { code: string; name: string; catalog: boolean; rarity: Rarity; behavior: Behavior; mult: number; mu: [number, number]; sigma: [number, number]; seen: number }[] = [
  { code: 'O2u', name: 'Orbium unicaudatus', catalog: true, rarity: 'common', behavior: 'swimmer', mult: 1.76, mu: [0.142, 0.158], sigma: [0.0138, 0.0162], seen: 41 },
  { code: 'OG2g', name: 'Gyrorbium gyrans', catalog: true, rarity: 'uncommon', behavior: 'spinner', mult: 2.34, mu: [0.15, 0.162], sigma: [0.021, 0.0238], seen: 12 },
  { code: 'S1s', name: 'Scutium solidus', catalog: true, rarity: 'rare', behavior: 'still', mult: 1.6, mu: [0.28, 0.3], sigma: [0.043, 0.047], seen: 5 },
  { code: 'O4d', name: 'Parorbium dividuus', catalog: true, rarity: 'rare', behavior: 'divider', mult: 3.52, mu: [0.17, 0.178], sigma: [0.021, 0.023], seen: 3 },
  { code: 'H3s', name: 'Espécimen 5', catalog: false, rarity: 'uncommon', behavior: 'pulsing', mult: 1.69, mu: [0.34, 0.36], sigma: [0.058, 0.062], seen: 2 },
  { code: 'P4cp', name: 'Paraptera cavus pedes', catalog: true, rarity: 'veryRare', behavior: 'swimmer', mult: 3.2, mu: [0.295, 0.305], sigma: [0.044, 0.047], seen: 1 },
  { code: 'O2b', name: 'Orbium bicaudatus', catalog: true, rarity: 'common', behavior: 'colony', mult: 2.75, mu: [0.145, 0.155], sigma: [0.013, 0.015], seen: 8 },
];

export class MockGame implements GameActions {
  readonly gridW = 192;
  readonly gridH = 240;
  essence = 18_450;
  essencePerSec = 37.4;
  samples = 14;
  genome = 7;
  era = 2;
  buyQty: BuyQty = 1;
  speed = 1;
  time = 0;
  settings: Settings = {
    lang: 'es',
    sfxVolume: 0.7,
    musicVolume: 0.5,
    muted: false,
    vibration: true,
    reduceMotion: false,
    oneTouch: false,
    quality: 'auto',
    analytics: false,
  };
  calibration = { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 };
  regimes = [
    { name: 'Orbium', mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 },
    { name: 'Gyro', mu: 0.156, sigma: 0.0224, R: 13, dt: 0.1 },
  ];
  upgrades: MockUpgrade[];
  species: MockSpecies[] = [];
  nodes: GenomeNodeView[];
  journal: JournalEntryView[];
  achievements: AchievementView[];
  creatures: MockCreature[] = [];
  golden: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  buffs: { id: string; name: Text; remaining: number; mult: number }[] = [];
  objective: Text | null = T('Descubre 8 especies (7/8)', 'Discover 8 species (7/8)');
  tabs = { lab: true, bestiary: true, calibrate: true, genome: true };
  tools = { longPress: true, brush: true, eraser: true, speeds: [1, 2, 4], speed: 1, markers: true };
  stats = { playTime: 3 * 3600 + 1240, totalEssence: 2_340_000, eraEssence: 412_000, seeds: 312, creaturesBorn: 88, eraTime: 41 * 60 };
  pipette = { active: false, progress: 0 };
  private nextId = 1;
  private nextGolden = 6;
  private seedRng = 1;

  constructor(scene: string) {
    this.upgrades = makeUpgrades();
    this.nodes = makeNodes();
    this.journal = [
      { id: 'j1', text: T('Día 1. La placa está limpia. Veinte unidades de esencia y una pipeta. Empecemos.', 'Day 1. The dish is clean. Twenty units of essence and a pipette. Let us begin.'), read: true },
      { id: 'j2', text: T('Casi todo se disuelve. Lo que sobrevive tiene forma… y se mueve.', 'Almost everything dissolves. What survives has shape… and moves.'), read: true },
      { id: 'j3', text: T('Algo nada en círculos. No lo sembré así. Lo llamaré Gyrorbium.', 'Something swims in circles. I did not seed it that way. I will call it Gyrorbium.'), read: true },
      { id: 'j4', text: T('Al cambiar μ todo murió. Y luego, de la nada, algo nuevo.', 'Changing μ killed everything. And then, out of nothing, something new.'), read: false },
    ];
    this.achievements = [
      { id: 'a1', name: T('Primer aliento', 'First breath'), desc: T('Estabiliza tu primera criatura', 'Stabilize your first creature'), done: true, reward: T('+2 % Esencia', '+2% Essence') },
      { id: 'a2', name: T('Naturalista', 'Naturalist'), desc: T('Registra 5 especies', 'Register 5 species'), done: true, reward: T('+5 % Esencia', '+5% Essence') },
      { id: 'a3', name: T('Destello', 'Spark'), desc: T('Atrapa un destello dorado', 'Catch a golden spark'), done: true, reward: T('+1 % Esencia', '+1% Essence') },
      { id: 'a4', name: T('Ecosistema', 'Ecosystem'), desc: T('Ten 10 criaturas estables a la vez', 'Have 10 stable creatures at once'), done: false, reward: T('+5 % Esencia', '+5% Essence') },
      { id: 'a5', name: T('Renacer', 'Rebirth'), desc: T('Provoca tu primera Extinción', 'Trigger your first Extinction'), done: false, reward: T('+1 Genoma', '+1 Genome') },
      { id: 'a6', name: T('Coleccionista', 'Collector'), desc: T('Registra 15 especies', 'Register 15 species'), done: false, reward: T('+10 % Esencia', '+10% Essence') },
    ];
    SPECIES_DEF.forEach((d, i) => {
      this.species.push({
        id: 'sp' + (i + 1),
        code: d.code,
        name: d.catalog ? d.name : d.name,
        catalogName: d.catalog ? d.name : null,
        rarity: d.rarity,
        behavior: d.behavior,
        mult: d.mult,
        timesSeen: d.seen,
        era: i < 4 ? 1 : 2,
        portrait: catalogPattern(d.code),
        muRange: d.mu,
        sigmaRange: d.sigma,
        printCost: i < 2 ? 3 : 6,
        isNew: i === 5,
      });
    });
    // Living creatures on the dish.
    const place: [number, number, string | null, CreatureView['state']][] = [
      [52, 60, 'sp1', 'stable'],
      [140, 70, 'sp2', 'stable'],
      [96, 132, 'sp3', 'stable'],
      [40, 190, 'sp5', 'stable'],
      [150, 180, 'sp1', 'stable'],
      [110, 40, null, 'born'],
      [160, 120, null, 'exploded'],
    ];
    for (const [x, y, sid, st] of place) this.spawn(x, y, sid, st);
    this.golden = { x: 70, y: 110, vx: 3.2, vy: -1.6, life: 0.8 };
    this.buffs = [{ id: 'bloom', name: T('Floración', 'Bloom'), remaining: 23, mult: 7 }];

    if (scene === 'fresh') this.makeFresh();
    if (scene === 'early') this.makeEarly();
  }

  private makeFresh(): void {
    this.essence = 20;
    this.essencePerSec = 0;
    this.samples = 0;
    this.genome = 0;
    this.era = 1;
    this.species = [];
    this.creatures = [];
    this.golden = null;
    this.buffs = [];
    this.journal = [];
    this.objective = T('Toca la placa para sembrar vida', 'Tap the dish to seed life');
    this.tabs = { lab: false, bestiary: false, calibrate: false, genome: false };
    this.tools = { longPress: false, brush: false, eraser: true, speeds: [1], speed: 1, markers: false };
    this.stats = { playTime: 0, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0, eraTime: 0 };
    for (const u of this.upgrades) {
      u.level = 0;
      u.unlocked = u.id === 'dropper';
    }
    this.regimes = [];
  }

  private makeEarly(): void {
    this.makeFresh();
    this.essence = 34;
    this.essencePerSec = 1.2;
    this.tabs = { lab: true, bestiary: false, calibrate: false, genome: false };
    this.stats.seeds = 5;
    this.objective = T('Compra Gotero I', 'Buy Dropper I');
    this.spawn(96, 120, null, 'stable');
  }

  private spawn(x: number, y: number, speciesId: string | null, state: CreatureView['state']): MockCreature {
    const sp = speciesId ? this.species.find((s) => s.id === speciesId) : undefined;
    const b = sp?.behavior ?? null;
    const speed = b === 'swimmer' ? 5 : b === 'spinner' ? 4 : 0;
    const a = Math.random() * Math.PI * 2;
    const c: MockCreature = {
      id: this.nextId++,
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      spin: b === 'spinner' ? 0.8 : 0,
      r: 5.5,
      state,
      behavior: state === 'stable' ? b : null,
      speciesId: state === 'stable' ? (speciesId ?? null) : null,
      eps: state === 'stable' ? 1 + Math.random() * 4 : 0,
      age: state === 'born' ? 50 : 1200 + Math.floor(Math.random() * 4000),
      bornAt: this.time,
      fate: Math.random() < 0.55 ? 'stable' : Math.random() < 0.7 ? 'die' : 'explode',
      incomeAt: this.time + Math.random() * 1.5,
      heading: a,
    };
    if (state === 'born') c.fate = 'stable';
    this.creatures.push(c);
    return c;
  }

  /** Pattern drawn by the fake dish renderer for a creature. */
  patternOf(c: CreatureView): Pattern {
    const sp = c.speciesId ? this.species.find((s) => s.id === c.speciesId) : undefined;
    return catalogPattern(sp?.code ?? 'O2u');
  }

  headingOf(id: number): number {
    return this.creatures.find((c) => c.id === id)?.heading ?? 0;
  }

  tick(dt: number): void {
    const d = dt * this.speed;
    this.time += d;
    this.stats.playTime += dt;
    const eps = this.creatures.reduce((s, c) => s + (c.state === 'stable' ? c.eps : 0), 0);
    const mult = this.buffs.reduce((m, b) => m * b.mult, 1);
    this.essencePerSec = eps * mult;
    this.essence += this.essencePerSec * d;
    this.stats.totalEssence += this.essencePerSec * d;
    this.stats.eraEssence += this.essencePerSec * d;

    for (const c of this.creatures) {
      if (c.spin) {
        c.heading += c.spin * d;
        const sp = Math.hypot(c.vx, c.vy);
        c.vx = Math.cos(c.heading) * sp;
        c.vy = Math.sin(c.heading) * sp;
      } else if (c.vx || c.vy) c.heading = Math.atan2(c.vy, c.vx);
      c.x = mod(c.x + c.vx * d, this.gridW);
      c.y = mod(c.y + c.vy * d, this.gridH);
      c.age += Math.round(60 * d);
      if (c.state === 'born' && this.time - c.bornAt > 3.2) {
        if (c.fate === 'stable') {
          c.state = 'stable';
          const sp = this.species[Math.floor(Math.random() * this.species.length)];
          if (sp) {
            c.speciesId = sp.id;
            c.behavior = sp.behavior;
            if (sp.behavior === 'swimmer' || sp.behavior === 'spinner') {
              const a = Math.random() * Math.PI * 2;
              c.vx = Math.cos(a) * 5;
              c.vy = Math.sin(a) * 5;
              c.spin = sp.behavior === 'spinner' ? 0.8 : 0;
            }
          }
          c.eps = 0.8 + Math.random() * 3;
          bus.emit('creatureStable', { id: c.id, x: c.x, y: c.y });
          if (!this.tabs.lab) {
            // Mini progression for the first-run scenes.
            this.tabs.lab = true;
            this.objective = T('Compra Gotero I (0/1)', 'Buy Dropper I (0/1)');
          }
        } else if (c.fate === 'explode') {
          c.state = 'exploded';
          bus.emit('creatureExploded', { id: c.id, x: c.x, y: c.y });
        } else {
          c.state = 'dead';
          bus.emit('creatureDied', { id: c.id, x: c.x, y: c.y });
        }
      }
      if (c.state === 'stable' && this.time >= c.incomeAt) {
        c.incomeAt = this.time + 1.6 + Math.random() * 0.6;
        bus.emit('income', { id: c.id, x: c.x, y: c.y, amount: c.eps * mult * 1.6 });
      }
    }
    this.creatures = this.creatures.filter((c) => c.state !== 'dead');

    for (const b of this.buffs) b.remaining -= dt;
    this.buffs = this.buffs.filter((b) => b.remaining > 0);

    if (this.golden) {
      this.golden.x = mod(this.golden.x + this.golden.vx * d, this.gridW);
      this.golden.y = mod(this.golden.y + this.golden.vy * d, this.gridH);
      this.golden.life -= dt / 14;
      if (this.golden.life <= 0) {
        this.golden = null;
        bus.emit('goldenMissed', {});
        this.nextGolden = this.time + 12;
      }
    } else if (this.time > this.nextGolden && this.tabs.bestiary) {
      const a = Math.random() * Math.PI * 2;
      this.golden = { x: Math.random() * this.gridW, y: Math.random() * this.gridH, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 1 };
      bus.emit('goldenSpawn', { x: this.golden.x, y: this.golden.y });
    }
    if (this.pipette.active) {
      this.pipette.progress = Math.min(1, this.pipette.progress + dt / 10);
      if (this.pipette.progress >= 1) {
        this.pipette = { active: false, progress: 0 };
        this.essence += this.seedCost();
      }
    }
  }

  seedCost(): number {
    const stable = this.creatures.filter((c) => c.state === 'stable').length;
    return Math.round(5 * Math.pow(1.35, stable));
  }

  view(): GameView {
    const qty = (u: MockUpgrade): { cost: number; qty: number } => {
      let n = this.buyQty === 'max' ? 0 : this.buyQty;
      const left = u.maxLevel === null ? Infinity : u.maxLevel - u.level;
      const have = u.currency === 'essence' ? this.essence : this.samples;
      if (this.buyQty === 'max') {
        let c = 0;
        while (n < left && n < 500) {
          const next = costAt(u, u.level + n);
          if (c + next > have) break;
          c += next;
          n++;
        }
        n = Math.max(1, n);
      }
      n = Math.min(n, left === Infinity ? n : Math.max(1, left));
      let cost = 0;
      for (let i = 0; i < n; i++) cost += costAt(u, u.level + i);
      return { cost, qty: n };
    };
    const upgrades: UpgradeView[] = this.upgrades.map((u) => {
      const maxed = u.maxLevel !== null && u.level >= u.maxLevel;
      const q = qty(u);
      const have = u.currency === 'essence' ? this.essence : this.samples;
      return {
        id: u.id,
        tab: u.tab,
        name: u.name,
        desc: u.desc,
        effect: u.effect(u.level),
        level: u.level,
        maxLevel: u.maxLevel,
        cost: q.cost,
        qty: q.qty,
        currency: u.currency,
        affordable: !maxed && have >= q.cost,
        unlocked: u.unlocked,
        unlockHint: u.unlockHint,
        maxed,
      };
    });
    const genomeNodes = this.nodes.map((n) => {
      const available = n.requires.every((r) => this.nodes.find((x) => x.id === r)?.owned);
      return { ...n, available, affordable: available && this.genome >= n.cost };
    });
    const behaviorsSeen = [...new Set(this.species.map((s) => s.behavior).filter((b): b is Behavior => !!b))];
    const creatures: CreatureView[] = this.creatures.map((c) => {
      const sp = c.speciesId ? this.species.find((s) => s.id === c.speciesId) : undefined;
      return {
        id: c.id,
        x: c.x,
        y: c.y,
        r: c.r,
        state: c.state,
        behavior: c.behavior,
        speciesId: c.speciesId,
        speciesName: sp ? (sp.catalogName ?? sp.name) : null,
        eps: c.eps,
        age: c.age,
        vx: c.vx / MOCK_STEPS_PER_SEC,
        vy: c.vy / MOCK_STEPS_PER_SEC,
      };
    });
    const genomeGain = Math.floor(Math.sqrt(this.stats.eraEssence / 1e4));
    return {
      essence: this.essence,
      essencePerSec: this.essencePerSec,
      samples: this.samples,
      genome: this.genome,
      era: this.era,
      seedCost: this.seedCost(),
      canSeed: this.essence >= this.seedCost(),
      pipette: { ...this.pipette },
      tools: { ...this.tools, speed: this.speed },
      upgrades,
      genomeNodes,
      species: this.species.map((s) => ({ ...s })),
      behaviorsSeen,
      calibration: {
        ...this.calibration,
        muRange: this.tabs.calibrate ? [0.1, 0.5] : null,
        sigmaRange: this.tabs.calibrate ? [0.005, 0.08] : null,
        RRange: null,
        dtRange: this.tabs.calibrate ? [0.05, 0.5] : null,
        regimes: this.regimes.map((r) => ({ ...r })),
        maxRegimes: this.tabs.calibrate ? 8 : 0,
      },
      journal: this.journal.map((j) => ({ ...j })),
      achievements: this.achievements,
      extinction: {
        available: genomeGain >= 5,
        genomeGain,
        gainIn10Min: Math.floor(Math.sqrt((this.stats.eraEssence + this.essencePerSec * 600) / 1e4)),
        requirement: T('Necesitas 250 000 Esencia en esta Era', 'You need 250,000 Essence this Era'),
      },
      golden: this.golden ? { x: this.golden.x, y: this.golden.y, life: this.golden.life } : null,
      buffs: this.buffs.map((b) => ({ ...b })),
      creatures,
      objective: this.objective,
      settings: { ...this.settings },
      tabs: { ...this.tabs },
      stats: { ...this.stats },
    };
  }

  // ───────────────────────────── GameActions ─────────────────────────────

  private spec(x: number, y: number, big = false): SeedSpec {
    return { x, y, radius: big ? 19 : 13, density: 0.6, noise: 0.3, shape: 'blob', rngSeed: this.seedRng++ };
  }

  seedAt(x: number, y: number, opts?: { big?: boolean }): SeedSpec | null {
    const cost = this.seedCost() * (opts?.big ? 2.25 : 1);
    if (this.essence < cost) {
      bus.emit('seedDenied', { x, y, cost });
      if (this.creatures.length === 0 && !this.pipette.active) this.pipette = { active: true, progress: 0 };
      return null;
    }
    this.essence -= cost;
    this.stats.seeds++;
    bus.emit('seed', { x, y, cost, manual: true });
    const c = this.spawn(x, y, null, 'born');
    c.fate = Math.random() < 0.5 ? 'stable' : Math.random() < 0.6 ? 'die' : 'explode';
    // First-run: the very first life always makes it (keeps the tutorial demo snappy).
    if (!this.creatures.some((o) => o.state === 'stable')) c.fate = 'stable';
    bus.emit('creatureBorn', { id: c.id, x, y });
    if (this.stats.seeds === 1) {
      this.journalAdd(T('Primera siembra. La materia tiembla, se reorganiza…', 'First seed. The matter trembles, rearranges…'));
    }
    return this.spec(x, y, opts?.big);
  }

  brushAt(x: number, y: number): SeedSpec[] {
    if (this.essence < 1) return [];
    this.essence -= 1;
    bus.emit('seed', { x, y, cost: 1, manual: false });
    return [this.spec(x, y)];
  }

  erase(x: number, y: number): void {
    for (const c of this.creatures) {
      const dx = Math.abs(c.x - x);
      const dy = Math.abs(c.y - y);
      if (Math.hypot(Math.min(dx, this.gridW - dx), Math.min(dy, this.gridH - dy)) < 10) {
        c.state = 'dead';
        bus.emit('creatureDied', { id: c.id, x: c.x, y: c.y });
      }
    }
    this.creatures = this.creatures.filter((c) => c.state !== 'dead');
  }

  printAt(speciesId: string, x: number, y: number): SeedSpec | null {
    const sp = this.species.find((s) => s.id === speciesId);
    if (!sp || this.samples < sp.printCost) return null;
    this.samples -= sp.printCost;
    const c = this.spawn(x, y, null, 'born');
    c.fate = 'stable';
    return { ...this.spec(x, y), shape: 'pattern', pattern: sp.portrait ?? undefined };
  }

  buyUpgrade(id: string, qty: BuyQty): boolean {
    const u = this.upgrades.find((x) => x.id === id);
    if (!u || !u.unlocked) return false;
    this.buyQty = qty;
    const v = this.view().upgrades.find((x) => x.id === id)!;
    if (!v.affordable) return false;
    if (u.currency === 'essence') this.essence -= v.cost;
    else this.samples -= v.cost;
    u.level += v.qty;
    bus.emit('upgradeBought', { id, level: u.level });
    if (id === 'dropper' && u.level >= 2) this.tools.longPress = true;
    if (id === 'dropper' && u.level >= 3) this.tools.brush = true;
    if (this.objective && this.objective.en.startsWith('Buy')) this.objective = T('Registra tu primera especie (0/1)', 'Register your first species (0/1)');
    return true;
  }

  buyGenomeNode(id: string): boolean {
    const n = this.nodes.find((x) => x.id === id);
    if (!n || n.owned) return false;
    const ok = n.requires.every((r) => this.nodes.find((x) => x.id === r)?.owned);
    if (!ok || this.genome < n.cost) return false;
    this.genome -= n.cost;
    n.owned = true;
    bus.emit('genomeBought', { id });
    return true;
  }

  extinguish(): boolean {
    const gain = Math.floor(Math.sqrt(this.stats.eraEssence / 1e4));
    if (gain < 5) return false;
    bus.emit('extinctionStart', { genome: gain });
    setTimeout(() => {
      this.genome += gain;
      this.era++;
      this.essence = 20;
      this.stats.eraEssence = 0;
      this.stats.eraTime = 0;
      for (const u of this.upgrades) if (u.tab === 'lab') u.level = 0;
      bus.emit('extinctionDone', { era: this.era, genome: gain });
      this.journalAdd(T('Blanco. Silencio. Y sin embargo, el genoma recuerda.', 'White. Silence. And yet the genome remembers.'));
    }, 50);
    return true;
  }

  /** Called by the dev harness when the ritual reaches full white. */
  clearDish(): void {
    this.creatures = [];
    this.golden = null;
  }

  setCalibration(p: Partial<Pick<LeniaParams, 'mu' | 'sigma' | 'R' | 'dt'>>): void {
    Object.assign(this.calibration, p);
    bus.emit('calibrationChanged', { ...this.calibration });
  }

  saveRegime(name: string): boolean {
    if (this.regimes.length >= 8) return false;
    this.regimes.push({ name, ...this.calibration });
    return true;
  }

  loadRegime(index: number): void {
    const r = this.regimes[index];
    if (r) this.setCalibration({ mu: r.mu, sigma: r.sigma, R: r.R, dt: r.dt });
  }

  deleteRegime(index: number): void {
    this.regimes.splice(index, 1);
  }

  renameSpecies(id: string, name: string): void {
    const s = this.species.find((x) => x.id === id);
    if (s) s.name = name;
  }

  markSpeciesSeen(id: string): void {
    const s = this.species.find((x) => x.id === id);
    if (s) s.isNew = false;
  }

  collectGolden(): void {
    if (!this.golden) return;
    const { x, y } = this.golden;
    this.golden = null;
    this.nextGolden = this.time + 15;
    const r = Math.random();
    let reward: Text;
    if (r < 0.5) {
      this.buffs.push({ id: 'bloom' + this.time, name: T('Floración', 'Bloom'), remaining: 30, mult: 7 });
      reward = T('¡Floración! ×7 producción 30 s', 'Bloom! ×7 production 30 s');
    } else {
      const lump = Math.max(50, this.essencePerSec * 90);
      this.essence += lump;
      reward = T(`¡Cosecha! +${Math.round(lump)} Esencia`, `Harvest! +${Math.round(lump)} Essence`);
    }
    bus.emit('goldenCollected', { x, y, reward });
  }

  markJournalRead(id?: string): void {
    for (const j of this.journal) if (!id || j.id === id) j.read = true;
  }

  setSpeed(mult: number): void {
    this.speed = mult;
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
  }

  setBuyQty(q: BuyQty): void {
    this.buyQty = q;
  }

  journalAdd(text: Text): void {
    const id = 'j' + (this.journal.length + 1);
    this.journal.push({ id, text, read: false });
    bus.emit('journalNew', { id, text });
  }

  /** Fire a "new species" event at a random stable creature (dev button). */
  fakeDiscovery(): void {
    const c = this.creatures.find((x) => x.state === 'stable');
    if (!c) return;
    const sp = this.species[1];
    bus.emit('speciesNew', { speciesId: sp.id, name: sp.catalogName ?? sp.name, rarity: sp.rarity, x: c.x, y: c.y });
  }
}

function costAt(u: MockUpgrade, level: number): number {
  return Math.round(u.base * Math.pow(u.growth, level));
}

function makeUpgrades(): MockUpgrade[] {
  const pct = (per: number) => (l: number) => T(`+${l * per} % → +${(l + 1) * per} %`, `+${l * per}% → +${(l + 1) * per}%`);
  return [
    {
      id: 'dropper', tab: 'lab', name: T('Gotero', 'Dropper'),
      desc: T('Semillas más consistentes. II: toque largo. III: pincel. IV: semilla anillo. V: selector de forma.', 'More consistent seeds. II: long press. III: brush. IV: ring seed. V: shape selector.'),
      effect: (l) => T(['Densidad consistente', 'Toque largo', 'Pincel', 'Semilla anillo', 'Selector de forma', 'Completo'][Math.min(l, 5)], ['Consistent density', 'Long press', 'Brush', 'Ring seed', 'Shape selector', 'Complete'][Math.min(l, 5)]),
      base: 15, growth: 4.2, maxLevel: 5, level: 3, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'autoSeeder', tab: 'lab', name: T('Sembrador automático', 'Auto-seeder'),
      desc: T('Siembra sola en un punto libre cada 20 s; cada nivel −8 % del intervalo.', 'Seeds a free spot every 20 s; each level −8% interval.'),
      effect: (l) => T(`Cada ${(20 * Math.pow(0.92, l)).toFixed(1)} s → ${(20 * Math.pow(0.92, l + 1)).toFixed(1)} s`, `Every ${(20 * Math.pow(0.92, l)).toFixed(1)} s → ${(20 * Math.pow(0.92, l + 1)).toFixed(1)} s`),
      base: 40, growth: 1.25, maxLevel: null, level: 9, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'culture', tab: 'lab', name: T('Cultivo', 'Culture'),
      desc: T('+10 % a toda la producción.', '+10% to all production.'),
      effect: pct(10), base: 50, growth: 1.35, maxLevel: null, level: 14, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'calibrator', tab: 'lab', name: T('Calibrador', 'Calibrator'),
      desc: T('Desbloquea y amplía los sliders de la pestaña Calibrar.', 'Unlocks and widens the Calibrate sliders.'),
      effect: () => T('σ y regímenes → μ amplio + dt', 'σ & regimes → wide μ + dt'),
      base: 25, growth: 10, maxLevel: 4, level: 2, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'stabilizer', tab: 'lab', name: T('Estabilizador', 'Stabilizer'),
      desc: T('+3 % de probabilidad de que una siembra se estabilice.', '+3% chance that a seed stabilizes.'),
      effect: pct(3), base: 80, growth: 1.3, maxLevel: 10, level: 10, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'dish', tab: 'lab', name: T('Placa', 'Dish'),
      desc: T('Más espacio para criaturas.', 'More room for creatures.'),
      effect: (l) => T(`Lado ${[128, 160, 192, 224, 256][l]} → ${[128, 160, 192, 224, 256][Math.min(4, l + 1)]}`, `Side ${[128, 160, 192, 224, 256][l]} → ${[128, 160, 192, 224, 256][Math.min(4, l + 1)]}`),
      base: 100, growth: 10, maxLevel: 4, level: 2, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'incubator', tab: 'lab', name: T('Incubadora', 'Incubator'),
      desc: T('Botón de velocidad ×2 y ×4.', 'Speed button ×2 and ×4.'),
      effect: () => T('×2 → ×4', '×2 → ×4'), base: 200, growth: 10, maxLevel: 2, level: 1, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'swimAffinity', tab: 'lab', name: T('Afinidad nadadora', 'Swimmer affinity'),
      desc: T('+8 % a nadadoras y giratorias.', '+8% to swimmers and spinners.'),
      effect: pct(8), base: 120, growth: 1.35, maxLevel: 10, level: 4, unlocked: true, unlockHint: T('', ''), currency: 'essence',
    },
    {
      id: 'colonyAffinity', tab: 'lab', name: T('Afinidad colonial', 'Colonial affinity'),
      desc: T('+8 % a divisoras y colonias.', '+8% to dividers and colonies.'),
      effect: pct(8), base: 300, growth: 1.35, maxLevel: 10, level: 0, unlocked: false, unlockHint: T('Primera división', 'First division'), currency: 'essence',
    },
    {
      id: 'reserve', tab: 'lab', name: T('Reserva', 'Reserve'),
      desc: T('Tope de progreso offline.', 'Offline progress cap.'),
      effect: () => T('2 h → 8 h', '2 h → 8 h'), base: 500, growth: 10, maxLevel: 3, level: 0, unlocked: false, unlockHint: T('Vuelve tras cerrar el juego', 'Come back after closing the game'), currency: 'essence',
    },
    {
      id: 'nutrient', tab: 'lab', name: T('Nutriente', 'Nutrient'),
      desc: T('+4 % de complejidad medida.', '+4% measured complexity.'),
      effect: pct(4), base: 1000, growth: 1.5, maxLevel: 5, level: 0, unlocked: false, unlockHint: T('Cultivo nivel 10', 'Culture level 10'), currency: 'essence',
    },
    {
      id: 'microscope', tab: 'bestiary', name: T('Microscopio', 'Microscope'),
      desc: T('I: rango de μ y σ. II: velocidad y firma. III: zonas sin descubrir.', 'I: μ and σ range. II: speed and signature. III: undiscovered zones.'),
      effect: () => T('Velocidad y firma', 'Speed and signature'), base: 3, growth: 2.6, maxLevel: 3, level: 1, unlocked: true, unlockHint: T('', ''), currency: 'samples',
    },
    {
      id: 'cataloguing', tab: 'bestiary', name: T('Catalogación', 'Cataloguing'),
      desc: T('+10 % al multiplicador de todas las especies.', '+10% to every species multiplier.'),
      effect: pct(10), base: 5, growth: 1.5, maxLevel: 5, level: 2, unlocked: true, unlockHint: T('', ''), currency: 'samples',
    },
    {
      id: 'marker', tab: 'bestiary', name: T('Marcador', 'Marker'),
      desc: T('Las criaturas muestran su comportamiento en la placa.', 'Creatures show their behaviour on the dish.'),
      effect: () => T('Marcas de comportamiento', 'Behaviour marks'), base: 10, growth: 1, maxLevel: 1, level: 1, unlocked: true, unlockHint: T('', ''), currency: 'samples',
    },
    {
      id: 'archive', tab: 'bestiary', name: T('Archivo', 'Archive'),
      desc: T('Una impresión gratis cada 10 min.', 'A free print every 10 min.'),
      effect: () => T('Cada 10 min', 'Every 10 min'), base: 6, growth: 2.5, maxLevel: 3, level: 0, unlocked: false, unlockHint: T('Registra 8 especies', 'Register 8 species'), currency: 'samples',
    },
  ];
}

function makeNodes(): GenomeNodeView[] {
  const n = (id: string, branch: GenomeNodeView['branch'], es: string, en: string, des: string, den: string, cost: number, requires: string[], owned = false): GenomeNodeView => ({
    id, branch, name: T(es, en), desc: T(des, den), cost, owned, available: false, affordable: false, requires,
  });
  return [
    n('rings2', 'rules', 'Anillos dobles', 'Double rings', 'El kernel admite 2 picos. Aparecen Hydrogeminium y otras especies.', 'The kernel accepts 2 peaks. Hydrogeminium and others appear.', 3, [], true),
    n('rings3', 'rules', 'Anillos triples', 'Triple rings', '3 picos; aparecen Kronium y las especies de R = 18 y 27.', '3 peaks; Kronium and R = 18/27 species appear.', 8, ['rings2']),
    n('channel2', 'rules', 'Segundo canal', 'Second channel', 'Dos sustancias con kernels cruzados (Lenia multicanal).', 'Two substances with crossed kernels (multichannel Lenia).', 20, ['rings3']),
    n('flow', 'rules', 'Flujo', 'Flow', 'La masa se conserva y las criaturas compiten por materia.', 'Mass is conserved and creatures compete for matter.', 45, ['channel2']),
    n('dropMem', 'heritage', 'Memoria del Gotero', 'Dropper memory', 'Cada Era empieza con el Gotero al máximo alcanzado menos 1.', 'Each Era starts with the Dropper at its best level minus 1.', 2, [], true),
    n('regimes', 'heritage', 'Regímenes persisten', 'Regimes persist', 'Los regímenes guardados sobreviven a la Extinción.', 'Saved regimes survive Extinction.', 4, ['dropMem']),
    n('startEss', 'heritage', 'Arranque con Esencia', 'Essence head start', 'Cada Era empieza con 500 × Era de Esencia.', 'Each Era starts with 500 × Era Essence.', 7, ['regimes']),
    n('autoPersist', 'heritage', 'Sembrador persistente', 'Persistent seeder', 'Cada Era empieza con Sembrador automático nivel 3.', 'Each Era starts with Auto-seeder level 3.', 12, ['startEss']),
    n('mutations', 'fauna', 'Mutaciones', 'Mutations', 'El 10 % de las impresiones produce una variante.', '10% of prints produce a variant.', 5, []),
    n('symbiosis', 'fauna', 'Simbiosis', 'Symbiosis', 'Dos especies distintas a menos de 2 R: ×1.5 a ambas.', 'Two different species within 2 R: ×1.5 to both.', 10, ['mutations']),
    n('predation', 'fauna', 'Depredación', 'Predation', 'Un canal consume al otro donde se tocan.', 'One channel consumes the other where they touch.', 30, ['symbiosis', 'channel2']),
  ];
}


const LB_NAMES = [
  'Dra. Placa', 'orbium_fan', 'Gyro', 'Kronia', 'mu=0.15', 'Petri Dish', 'Scutum', 'LeniaLover', 'helix', 'Paraptera',
  'sigma_wolf', 'Chan_was_here', 'BioLuz', 'Nadadora', 'CelulaX', 'glider42', 'Hydro', 'TuringPattern', 'el_microscopio', 'Pulsar',
];

/** Fake leaderboard backend for the dev page (?lb=error to test failures). */
export class MockLeaderboard implements LeaderboardClient {
  private name: string | null = null;
  constructor(
    private game: MockGame,
    private mode: 'ok' | 'error' = 'ok',
  ) {}

  getName(): string | null {
    return this.name;
  }

  async setName(name: string): Promise<{ ok: boolean; error?: string }> {
    await wait(450);
    if (validateNickname(name) !== 'ok') return { ok: false, error: 'invalid' };
    if (/^admin$/i.test(name.trim())) return { ok: false, error: 'Ese nombre ya está en uso' };
    this.name = name.trim();
    return { ok: true };
  }

  async fetchTop(board: LeaderboardBoard): Promise<LeaderboardResult> {
    await wait(700);
    if (this.mode === 'error') return { error: 'network error (503)' };
    const base = board === 'essence' ? 9.4e9 : board === 'species' ? 26 : 14;
    const entries: LeaderboardEntry[] = LB_NAMES.map((n, i) => {
      const f = Math.pow(0.82, i);
      return {
        rank: i + 1,
        name: n,
        score: board === 'essence' ? Math.round(base * f) : Math.max(1, Math.round(base * Math.pow(0.93, i))),
        species: Math.max(1, Math.round(26 * Math.pow(0.95, i))),
        era: Math.max(1, Math.round(14 * Math.pow(0.9, i))),
        isMe: false,
        flagged: i === 6,
      };
    });
    const me: LeaderboardEntry | null = this.name
      ? {
          rank: board === 'essence' ? 137 : board === 'species' ? 41 : 88,
          name: this.name,
          score: board === 'essence' ? Math.round(this.game.stats.totalEssence) : board === 'species' ? this.game.species.length : this.game.era,
          species: this.game.species.length,
          era: this.game.era,
          isMe: true,
        }
      : null;
    return { entries, me };
  }

  async submitNow(): Promise<{ ok: boolean; error?: string }> {
    await wait(600);
    return this.mode === 'error' ? { ok: false, error: 'offline' } : { ok: true };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

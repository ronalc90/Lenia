/**
 * Headless "real dish" for cross-module tests and calibration scripts: the integrated sessions game
 * (createGame cycle 'sessions') driven exactly as src/main.ts drives it — CPU reference simulation on
 * the round dish, a snapshot every 10 steps to the detector, the glass deflector on every snapshot,
 * the runaway watch and the lysis backstop, and the game clock advancing by SIMULATED time (steps ÷
 * the steps per second of the current pace, ADR-027 / QA4 F-02). Not shipped.
 */
import { Bus, type GameEvents } from '../../src/core/bus';
import { dishForGrid, type DishShape } from '../../src/core/dish';
import type { DetectorReport, LeniaParams, SeedSpec } from '../../src/core/types';
import { createDetector, DISH_OVERGROWN_FILL } from '../../src/detect/detector';
import { createGame, type Game } from '../../src/game/game';
import { SIM_STEPS_PER_SEC, PREINCUBATE_STEPS } from '../../src/game/cycleBalance';
import { dishSeconds } from '../../src/game/dishClock';
import { seededRng } from '../../src/game/testUtil';
import { CpuLenia } from '../../src/sim/cpu';
import { Deflector, type Body, type Turn } from '../../src/sim/deflect';
import { BodyExtrapolator } from '../../src/sim/extrapolate';
import { RunawayWatch } from '../../src/sim/runaway';
import { applyEraseCpu, applySeedCpu } from '../../src/sim/seed';
import { snapshotFromCpu } from '../../src/sim/snapshot';
import { lysisTargets } from '../../src/app/lysis';

export const DETECT_EVERY = 10;

export interface RealDishOptions {
  /** Square grid (low quality = 168, medium/high = 232). */
  grid?: number;
  /** Dish diameter (Ø128 base). */
  diameter?: number;
  seed?: number;
  /**
   * Browser pipeline (main.ts): the snapshot of step S is read asynchronously and its report is
   * handled when the dish has already run DETECT_EVERY more steps; bodies are extrapolated to now
   * (BodyExtrapolator) and the turns land then. Default false: report and turns at the same step.
   */
  browserLag?: boolean;
  /** A save string to load (createGame's second argument). */
  save?: string;
}

export interface RealDishLog {
  died: { step: number; id: number; phase: string }[];
  stable: { step: number; id: number }[];
  speciesNew: { step: number; clock: number; id: string }[];
  events: string[];
}

export class RealDish {
  readonly bus = new Bus<GameEvents>();
  readonly game: Game;
  readonly sim: CpuLenia;
  readonly dish: DishShape;
  readonly N: number;
  readonly det = createDetector();
  readonly defl = new Deflector();
  readonly runaway = new RunawayWatch();
  readonly log: RealDishLog = { died: [], stable: [], speciesNew: [], events: [] };
  lastReport: DetectorReport | null = null;
  /** Debug hook: the deflector's bodies and turns at each update. */
  onDeflect?: (bodies: readonly Body[], turns: readonly Turn[], step: number) => void;
  /** Deflector turns applied so far. */
  turns = 0;
  private pending: SeedSpec[] = [];
  private clearPending = false;
  private acc = 0;
  private readonly lagMode: boolean;
  private inFlight: { snap: ReturnType<typeof snapshotFromCpu>; step: number } | null = null;
  readonly extrap = new BodyExtrapolator();
  private params: LeniaParams;

  constructor(o: RealDishOptions = {}) {
    this.N = o.grid ?? 168;
    this.lagMode = !!o.browserLag;
    const N = this.N;
    this.dish = dishForGrid(N, N, o.diameter ?? 128);
    this.bus.on('dishSeed', ({ specs }) => this.pending.push(...specs));
    this.bus.on('dishClear', () => {
      this.clearPending = true;
      this.pending.length = 0;
    });
    this.bus.on('creatureDied', ({ id }) => this.log.died.push({ step: this.sim?.stepCount ?? 0, id, phase: this.game?.session?.phase ?? '-' }));
    this.bus.on('creatureStable', ({ id }) => this.log.stable.push({ step: this.sim?.stepCount ?? 0, id }));
    this.bus.on('speciesNew', ({ speciesId }) =>
      this.log.speciesNew.push({ step: this.sim?.stepCount ?? 0, clock: this.game?.session?.elapsed ?? -1, id: speciesId }),
    );
    this.game = createGame({ bus: this.bus, rng: seededRng(o.seed ?? 1), cycle: 'sessions', grid: { w: N, h: N } }, o.save);
    this.game.setGridSize(N, N);
    this.game.setDish(this.dish);
    this.params = { ...this.game.simParams, rings: [...this.game.simParams.rings] };
    this.sim = new CpuLenia(N, N, this.params);
    this.sim.setDish(this.dish);
    this.det.setDish(this.dish);
    this.flush();
  }

  /** Apply what the game asked of the dish (clear, plants, world params). */
  flush(): void {
    const p = this.game.simParams;
    const sp = this.params;
    if (p.R !== sp.R || p.mu !== sp.mu || p.sigma !== sp.sigma || p.rings.join() !== sp.rings.join() || p.dt !== sp.dt) {
      this.params = { ...p, rings: [...p.rings] };
      this.sim.setParams({ ...this.params });
    }
    if (this.clearPending) {
      this.sim.A.fill(0);
      this.det.reset();
      this.det.setDish(this.dish);
      this.defl.reset();
      this.extrap.reset();
      this.inFlight = null;
      this.runaway.reset();
      this.clearPending = false;
    }
    for (const s of this.pending) applySeedCpu(this.sim.A, this.N, this.N, s, 1, { dish: this.dish });
    this.pending.length = 0;
  }

  /** One detector boundary: snapshot → detector → runaway → deflector (as main.ts detect()). */
  private detect(): DetectorReport {
    const now = snapshotFromCpu(this.sim.A, this.N, this.N, 2, this.sim.stepCount);
    let snap = now;
    let snapStep = this.sim.stepCount;
    if (this.lagMode) {
      // The report handled now is the previous boundary's; this boundary's snapshot is read after it.
      const prev = this.inFlight;
      if (!prev) {
        this.inFlight = { snap: now, step: this.sim.stepCount };
        return this.lastReport ?? this.det.update(now, this.params);
      }
      snap = prev.snap;
      snapStep = prev.step;
    }
    const rep = this.det.update(snap, this.params);
    const caught = this.runaway.update(rep, snap, this.params, this.dish);
    for (const e of caught.erase) this.erase(e.x, e.y, e.radius);
    const bodies = this.extrap.bodies(
      rep.creatures
        .filter((c) => c.state !== 'dead')
        .map((c) => ({ id: c.id, x: c.x, y: c.y, vx: c.vx, vy: c.vy, radius: c.radius, steerable: c.state !== 'exploded' && c.behavior !== 'colony' })),
      snapStep,
      this.sim.stepCount,
    );
    const turns = this.defl.update(bodies, this.dish, this.sim.stepCount, DETECT_EVERY);
    this.onDeflect?.(bodies, turns, this.sim.stepCount);
    this.extrap.noteTurns(turns);
    if (turns.length) {
      this.turns += turns.length;
      this.sim.applyTurns(turns);
      for (const t of turns) this.det.noteTurn(t.id, t.angle);
    }
    for (const t of lysisTargets(rep, this.params.R, DISH_OVERGROWN_FILL)) this.erase(t.x, t.y, t.radius);
    // The next snapshot is taken after this report's turns and erasures (main.ts: one readback in flight).
    if (this.lagMode) this.inFlight = { snap: snapshotFromCpu(this.sim.A, this.N, this.N, 2, this.sim.stepCount), step: this.sim.stepCount };
    this.lastReport = rep;
    return rep;
  }

  /** Incubate under the start card (ADR-027): real steps, game ticks with dt 0. */
  preincubate(steps = PREINCUBATE_STEPS): void {
    this.flush();
    for (let k = 0; k < steps; k += DETECT_EVERY) {
      this.sim.step(DETECT_EVERY);
      this.game.tick(0, this.detect());
      this.flush();
    }
  }

  /**
   * Run `seconds` of wall time at `fps`: each frame asks speed × 30 × dt steps (capped 4 × speed
   * like main.ts), runs them 10 at a time with a detection at each boundary, and ticks the game by
   * the simulated seconds those steps are worth.
   */
  run(seconds: number, fps = 60, onFrame?: (t: number) => void): void {
    const frames = Math.round(seconds * fps);
    for (let f = 0; f < frames; f++) {
      onFrame?.(f / fps);
      this.flush();
      const speed = this.game.speed;
      this.acc += (1 / fps) * SIM_STEPS_PER_SEC * speed;
      const whole = Math.floor(this.acc);
      let n = Math.min(whole, 4 * speed);
      this.acc -= whole;
      let stepped = 0;
      const reports: DetectorReport[] = [];
      while (n > 0) {
        const k = Math.min(n, DETECT_EVERY - (this.sim.stepCount % DETECT_EVERY));
        this.sim.step(k);
        n -= k;
        stepped += k;
        if (this.sim.stepCount % DETECT_EVERY === 0) reports.push(this.detect());
      }
      for (let i = 0; i < reports.length - 1; i++) this.game.tick(0, reports[i]);
      const dt = dishSeconds({ stepped, speed, wallDt: 1 / fps, paused: false });
      this.game.tick(dt, reports.length ? reports[reports.length - 1] : null);
    }
    this.flush();
  }

  erase(x: number, y: number, radius: number): void {
    applyEraseCpu(this.sim.A, this.N, this.N, x, y, radius, { dish: this.dish });
  }

  /** Alive creature count in the last report. */
  alive(): number {
    return this.lastReport ? this.lastReport.creatures.filter((c) => c.state !== 'dead').length : 0;
  }

  /** A player's tap at a grid point. */
  tap(x: number, y: number): boolean {
    const spec = this.game.actions.seedAt(x, y);
    if (spec) this.pending.push(spec);
    return !!spec;
  }
}

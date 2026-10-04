import type {
  Behavior,
  Creature,
  CreatureState,
  Detector,
  DetectorEvent,
  DetectorReport,
  FieldSnapshot,
  LeniaParams,
} from '../core/types';
import { wrapDelta } from '../core/camera';
import { SIG, SIG_LENGTH, SIG_UNKNOWN, SPECIES_MATCH_THRESHOLD, signatureDistance } from './signature';

/**
 * Creature detector: the game's judge of what is alive, what it does and whether
 * it is something new (design doc §9, with the brief's corrections: toroidal dish,
 * no border penalty, stable after ~400 steps, signature without μ/σ).
 *
 * Pipeline per `update` (the game calls it with a scale-2 snapshot every ~10 steps):
 *  1. Threshold (value ≥ 0.1) and 8-connected component labeling with toroidal wrap;
 *     body cells connect through a faint halo (≥ 0.02) so bound multi-part species
 *     are one creature. Specks below `minMassR2 · R²` are dropped.
 *  2. Components are tracked frame to frame ("blobs") by mask overlap with the
 *     previous labels (seamless across the wrap), falling back to the nearest
 *     predicted centroid. This handles merges (largest overlap continues) and splits.
 *  3. A creature (track) is a core blob plus the fragments that split off it and have
 *     not proven independent yet. A fragment that stays apart for `divideConfirm`
 *     steps (or drifts > 3R away) becomes its own creature → 'divided' event, child
 *     gets `parentId`. Fragments that re-merge are simply absorbed again, so bound
 *     pairs that touch and separate (Synorbium) stay one creature.
 *     Creatures that collide and fuse are remembered for a while; if they separate
 *     again the old id is restored instead of reporting a division.
 *  4. Per creature: mass, wrap-aware centroid, radius of gyration, gradient sum,
 *     angular harmonics (rotation-invariant shape descriptors whose phases give the
 *     body orientation, so rotating-in-place species are measurable), ring-buffer
 *     history.
 *  5. States: born → stable (age ≥ 400 steps, mass ratio within (0.5, 3), dominant
 *     core) → exploded (mass > 10 % of dish or > 12 R², mass runaway > 3× within the
 *     window, or big blob while the dish is > 40 % full; sticky 1000 steps) / dead
 *     (unseen for 20 steps).
 *  6. Behaviours over a 1000-step window, thresholds in R and steps:
 *     colony > divider > spinner > swimmer > pulsing > still.
 */

// ───────────────────────────── constants ─────────────────────────────

/**
 * Gradient sum (Σ|∇A| over the creature's cells plus a 1-cell rim, grid units) of the
 * reference Orbium unicaudatus (catalog O2u at its catalog params, R = 13) measured
 * through snapshotFromCpu at scale 2, averaged over steps 400–1500 on a 64×64 dish.
 * Measured by scripts/calibrate-detector.ts. complexity = gradSum / this, so a
 * stable Orbium yields ≈ 1.0 (it fluctuates ~±10 % as it swims) and a uniform
 * soup ≈ 0. Bigger R ⇒ bigger creatures ⇒ proportionally more complexity.
 */
export const ORBIUM_GRAD_SUM = 48.67;

export interface DetectorOptions {
  /** Matter threshold for a cell to belong to a creature. Default 0.1. */
  threshold?: number;
  /** Fainter matter that still connects body cells into one creature. Default 0.02. */
  linkThreshold?: number;
  /** Components lighter than this · R² (grid units) are ignored as specks. Default 0.04. */
  minMassR2?: number;
  /** Steps of age before a creature can become stable. Default 400. */
  stableAge?: number;
  /** Behaviour analysis window in steps. Default 1000. */
  window?: number;
  /** Age (steps) at which behaviour is first classified. Default 1000. */
  classifyAge?: number;
  /** Re-classify behaviours every this many steps. Default 50. */
  classifyEvery?: number;
  /** A creature unseen for this many steps is dead. Default 20. */
  deadAfter?: number;
  /** Steps a split-off fragment must stay apart to count as a division. Default 300. */
  divideConfirm?: number;
  /** Exploded state is kept this many steps after the last trigger. Default 1000. */
  explodeSticky?: number;
  /** Divider behaviour lasts this many steps after a division. Default 3000. */
  dividerMemory?: number;
  /** Complexity normalization (gradient sum of the reference Orbium). */
  orbiumGradSum?: number;
}

/** History record layout (one sample per update). */
const F_STEP = 0;
const F_MASS = 1;
const F_UX = 2;
const F_UY = 3;
const F_RG = 4;
const F_AREA = 5;
const F_GRAD = 6;
const F_PARTS = 7;
const F_H = 8; // 8..13: harmonic amplitudes n = 1..6
const F_ROT = 14; // 14..19: accumulated rotation (rad) seen through harmonic n = 1..6
const F_DENS = 20;
const F_COUNT = 21;
const HIST_CAP = 160;
const NH = 6;

const TWO_PI = Math.PI * 2;
/** Max mass in units of R² before a blob is "exploded" whatever the dish size. */
const EXPLODE_MASS_R2 = 12;
const EXPLODE_DISH_FRAC = 0.1;
const DISH_FILL_EXPLODE = 0.4;
const BIG_BLOB_DISH_FRAC = 0.02;
/** Stable requires the core blob to hold this share of the creature's mass. */
const DOMINANT_SHARE = 0.8;
/** Colony members may differ this many times the species threshold (static signature). */
const COLONY_MATCH = 2;
/** Static signature features are averaged over this many recent steps. */
const STATIC_SPAN = 400;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function wrapPi(a: number): number {
  return a - TWO_PI * Math.floor(a / TWO_PI + 0.5);
}

// ───────────────────────────── history ring ─────────────────────────────

class History {
  readonly data = new Float64Array(HIST_CAP * F_COUNT);
  head = 0; // next write slot
  count = 0;

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  push(rec: Float64Array): void {
    this.data.set(rec, this.head * F_COUNT);
    this.head = (this.head + 1) % HIST_CAP;
    if (this.count < HIST_CAP) this.count++;
  }

  /** Field f of sample k, k = 0 oldest .. count-1 newest. */
  get(k: number, f: number): number {
    const slot = (this.head - this.count + k + HIST_CAP) % HIST_CAP;
    return this.data[slot * F_COUNT + f];
  }

  /** Index of the oldest sample with step ≥ minStep (count if none). */
  firstSince(minStep: number): number {
    let k = this.count;
    while (k > 0 && this.get(k - 1, F_STEP) >= minStep) k--;
    return k;
  }

  scaleField(f: number, factor: number): void {
    for (let k = 0; k < this.count; k++) {
      const slot = (this.head - this.count + k + HIST_CAP) % HIST_CAP;
      this.data[slot * F_COUNT + f] *= factor;
    }
  }
}

// ───────────────────────────── tracking objects ─────────────────────────────

interface Blob {
  uid: number;
  owner: Track;
  /** Component index in the current frame, -1 when not seen this update. */
  comp: number;
  lastSeen: number;
  /** Step at which it split off its creature's core; -1 for the core itself. */
  detachedSince: number;
  x: number;
  y: number;
  mass: number;
}

interface Motion {
  /** Path speed, cells/step. */
  speed: number;
  /** Net displacement rate, cells/step. */
  net: number;
  /** Heading angular velocity, rad/step (0 when not moving). */
  turnHead: number;
  /** Body angular velocity through the strongest harmonic, rad/step. */
  turnBody: number;
  /** Mean amplitude of that harmonic. */
  bodyAmp: number;
  /** Relative amplitude of the dominant mass oscillation. */
  pulseAmp: number;
  /** Share of the detrended variance in that oscillation. */
  pulseDominance: number;
  /** Its period in steps (0 if none). */
  pulsePeriod: number;
}

interface Track {
  id: number;
  parentId: number | null;
  birthStep: number;
  lastSeen: number;
  blobs: Blob[];
  absorbed: { track: Track; at: number }[];
  state: CreatureState;
  explodedAt: number;
  behavior: Behavior | null;
  cand: Behavior | null;
  candCount: number;
  childIds: number[];
  lastDivision: number;
  /** Child of a division whose parent was stable (a true fission, not debris of an explosion). */
  fromFission: boolean;
  hist: History;
  measured: boolean;
  x: number;
  y: number;
  ux: number;
  uy: number;
  mass: number;
  area: number;
  /** Mass-weighted mean matter Σv²/Σv (robust to how the edge falls on the snapshot grid). */
  dens: number;
  rg: number;
  grad: number;
  coreShare: number;
  vx: number;
  vy: number;
  rot: Float64Array;
  phase: Float64Array;
  motion: Motion | null;
  signature: number[];
  /** Fused into another creature (kept only as a memory in its `absorbed`). */
  fused: boolean;
  /** Emit 'born' after its first measurement (children of a division). */
  announce: boolean;
  /** Step of the last fusion where this creature absorbed another one. */
  fusedAt: number;
  /** Step of the last fusion or division: shape/motion history before it is stale. */
  structAt: number;
}

// ───────────────────────────── detector ─────────────────────────────

export function createDetector(opts: DetectorOptions = {}): Detector {
  return new LeniaDetector(opts);
}

class LeniaDetector implements Detector {
  private readonly thr: number;
  private readonly link: number;
  private readonly minMassR2: number;
  private readonly stableAge: number;
  private readonly window: number;
  private readonly classifyAge: number;
  private readonly classifyEvery: number;
  private readonly deadAfter: number;
  private readonly divideConfirm: number;
  private readonly explodeSticky: number;
  private readonly dividerMemory: number;
  private readonly orbiumGrad: number;

  private tracks: Track[] = [];
  private nextId = 1;
  private nextBlobUid = 1;
  private lastStep = -Infinity;
  private lastClassify = -Infinity;

  // Per-frame buffers (reallocated when the snapshot size changes).
  private w = 0;
  private h = 0;
  private lab = new Int32Array(0);
  private prevLab = new Int32Array(0);
  private hasPrev = false;
  private cellIdx = new Int32Array(0);
  private cellUx = new Int32Array(0);
  private cellUy = new Int32Array(0);
  private compStart = new Int32Array(0);
  private compEnd = new Int32Array(0);
  private compMass = new Float64Array(0);
  private compGrad = new Float64Array(0);
  private compUx = new Float64Array(0);
  private compUy = new Float64Array(0);
  private compCx = new Float64Array(0);
  private compCy = new Float64Array(0);
  private compValid = new Uint8Array(0);
  private nComps = 0;
  private compBlob: (Blob | null)[] = [];
  private prevCompBlob: (Blob | null)[] = [];
  private ovl = new Float64Array(0);
  private rimStamp = new Int32Array(0);
  private stamp = 0;
  private rec = new Float64Array(F_COUNT);

  constructor(o: DetectorOptions) {
    this.thr = o.threshold ?? 0.1;
    this.link = Math.min(this.thr, o.linkThreshold ?? 0.02);
    this.minMassR2 = o.minMassR2 ?? 0.04;
    this.stableAge = o.stableAge ?? 400;
    this.window = o.window ?? 1000;
    this.classifyAge = o.classifyAge ?? 1000;
    this.classifyEvery = o.classifyEvery ?? 50;
    this.deadAfter = o.deadAfter ?? 20;
    this.divideConfirm = o.divideConfirm ?? 300;
    this.explodeSticky = o.explodeSticky ?? 1000;
    this.dividerMemory = o.dividerMemory ?? 3000;
    this.orbiumGrad = o.orbiumGradSum ?? ORBIUM_GRAD_SUM;
  }

  reset(): void {
    this.tracks = [];
    this.nextId = 1;
    this.lastStep = -Infinity;
    this.lastClassify = -Infinity;
    this.hasPrev = false;
  }

  update(snap: FieldSnapshot, params: LeniaParams): DetectorReport {
    if (snap.step < this.lastStep) this.reset(); // time went backwards: a new dish
    this.ensureBuffers(snap.w, snap.h);
    const step = snap.step;
    const R = Math.max(1, params.R);
    const s = snap.scale;
    const events: DetectorEvent[] = [];

    // ── 1. dish totals + components ──
    const { value } = snap;
    const N = snap.w * snap.h;
    let total = 0;
    let filled = 0;
    for (let i = 0; i < N; i++) {
      const v = value[i];
      total += v;
      if (v > this.thr) filled++;
    }
    const fill = N > 0 ? filled / N : 0;
    const totalMass = total * s * s;
    this.label(snap, this.minMassR2 * R * R);

    // ── 2. blob tracking ──
    const newborn = this.trackBlobs(snap, step, R);

    // ── 3. creatures ──
    const dishCells = snap.gridW * snap.gridH;
    const spawned: Track[] = [];
    const survivors: Track[] = [];
    for (const t of this.tracks) {
      if (this.processTrack(t, snap, step, R, fill, dishCells, events, spawned)) survivors.push(t);
    }
    for (const t of spawned) {
      if (this.processTrack(t, snap, step, R, fill, dishCells, events, null)) survivors.push(t);
    }
    this.tracks = survivors;
    for (const t of newborn) if (t.measured) events.push({ type: 'born', id: t.id, x: t.x, y: t.y });

    // ── 4. behaviours ──
    if (step - this.lastClassify >= this.classifyEvery) {
      this.lastClassify = step;
      this.classify(step, R, params, snap, events);
    }
    for (const t of this.tracks) t.signature = this.signatureOf(t, R, params);

    // ── 5. swap label buffers ──
    const tmp = this.prevLab;
    this.prevLab = this.lab;
    this.lab = tmp;
    const tb = this.prevCompBlob;
    this.prevCompBlob = this.compBlob;
    this.compBlob = tb;
    this.hasPrev = true;
    this.lastStep = step;

    const creatures: Creature[] = [];
    for (const t of this.tracks) {
      if (!t.measured) continue;
      creatures.push({
        id: t.id,
        x: t.x,
        y: t.y,
        radius: t.rg,
        mass: t.mass,
        complexity: t.grad / this.orbiumGrad,
        state: t.state,
        behavior: t.behavior,
        age: step - t.birthStep,
        vx: t.vx,
        vy: t.vy,
        signature: t.signature,
        parentId: t.parentId,
      });
    }
    return { step, creatures, events, totalMass, fill };
  }

  // ───────────────────────── labeling ─────────────────────────

  private ensureBuffers(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const N = w * h;
    this.w = w;
    this.h = h;
    this.lab = new Int32Array(N);
    this.prevLab = new Int32Array(N);
    this.hasPrev = false;
    this.cellIdx = new Int32Array(N);
    this.cellUx = new Int32Array(N);
    this.cellUy = new Int32Array(N);
    this.compStart = new Int32Array(N);
    this.compEnd = new Int32Array(N);
    this.compMass = new Float64Array(N);
    this.compGrad = new Float64Array(N);
    this.compUx = new Float64Array(N);
    this.compUy = new Float64Array(N);
    this.compCx = new Float64Array(N);
    this.compCy = new Float64Array(N);
    this.compValid = new Uint8Array(N);
    this.ovl = new Float64Array(N);
    this.rimStamp = new Int32Array(N);
    this.stamp = 0;
    this.compBlob = [];
    this.prevCompBlob = [];
  }

  /**
   * 8-connected labeling with toroidal wrap (BFS; the cell buffer doubles as the
   * queue). Body cells are those ≥ `threshold` (0.1); components grow through a faint
   * halo (≥ `linkThreshold`, 0.02) so that bound multi-part species (Synorbium, the
   * Parorbium pair) are one creature, while separate creatures — whose surroundings
   * are essentially empty — stay apart. Mass, centroid, gradient and shape use all
   * the component's cells (body + halo): including the faint rim makes them far less
   * sensitive to how a creature's edge falls on the coarse snapshot grid. Every cell
   * gets coordinates unwrapped along the BFS path,
   * so centroids and moments come out right for creatures straddling the edge.
   */
  private label(snap: FieldSnapshot, minMass: number): void {
    const { w, h, value, grad } = snap;
    const s2 = snap.scale * snap.scale;
    const N = w * h;
    const lab = this.lab;
    const thr = this.thr;
    const link = this.link;
    const cellIdx = this.cellIdx;
    const cellUx = this.cellUx;
    const cellUy = this.cellUy;
    lab.fill(-1);
    let nc = 0;
    let nCells = 0;
    for (let i = 0; i < N; i++) {
      if (lab[i] !== -1 || !(value[i] >= thr)) continue;
      const c = nc++;
      const start = nCells;
      const ox = i % w;
      const oy = (i - ox) / w;
      lab[i] = c;
      cellIdx[nCells] = i;
      cellUx[nCells] = ox;
      cellUy[nCells] = oy;
      nCells++;
      let head = start;
      let m = 0;
      let g = 0;
      let sx = 0;
      let sy = 0;
      let body = 0;
      while (head < nCells) {
        const k = cellIdx[head];
        const ux = cellUx[head];
        const uy = cellUy[head];
        head++;
        const v = value[k];
        m += v;
        g += grad[k];
        sx += v * (ux - ox);
        sy += v * (uy - oy);
        if (v >= thr) body++;
        const x = k % w;
        const y = (k - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          let ny = y + dy;
          if (ny < 0) ny += h;
          else if (ny >= h) ny -= h;
          const row = ny * w;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = x + dx;
            if (nx < 0) nx += w;
            else if (nx >= w) nx -= w;
            const q = row + nx;
            if (lab[q] !== -1 || !(value[q] >= link)) continue;
            lab[q] = c;
            cellIdx[nCells] = q;
            cellUx[nCells] = ux + dx;
            cellUy[nCells] = uy + dy;
            nCells++;
          }
        }
      }
      this.compStart[c] = start;
      this.compEnd[c] = nCells;
      this.compMass[c] = m;
      this.compGrad[c] = g;
      const cux = m > 0 ? ox + sx / m : ox;
      const cuy = m > 0 ? oy + sy / m : oy;
      this.compUx[c] = cux;
      this.compUy[c] = cuy;
      this.compCx[c] = mod(cux, w);
      this.compCy[c] = mod(cuy, h);
      const valid = m * s2 >= minMass && body >= 2;
      this.compValid[c] = valid ? 1 : 0;
      if (!valid) for (let k = start; k < nCells; k++) lab[cellIdx[k]] = -1;
    }
    this.nComps = nc;
  }

  // ───────────────────────── blob tracking ─────────────────────────

  private newTrack(step: number, parentId: number | null): Track {
    return {
      id: this.nextId++,
      parentId,
      birthStep: step,
      lastSeen: step,
      blobs: [],
      absorbed: [],
      state: 'born',
      explodedAt: -Infinity,
      behavior: null,
      cand: null,
      candCount: 0,
      childIds: [],
      lastDivision: -Infinity,
      fromFission: false,
      hist: new History(),
      measured: false,
      x: 0,
      y: 0,
      ux: 0,
      uy: 0,
      mass: 0,
      area: 0,
      dens: 0,
      rg: 0,
      grad: 0,
      coreShare: 1,
      vx: 0,
      vy: 0,
      rot: new Float64Array(NH + 1),
      phase: new Float64Array(NH + 1),
      motion: null,
      signature: new Array<number>(SIG_LENGTH).fill(SIG_UNKNOWN),
      fused: false,
      announce: false,
      fusedAt: -Infinity,
      structAt: -Infinity,
    };
  }

  private newBlob(owner: Track, c: number, step: number, detachedSince: number): Blob {
    const b: Blob = {
      uid: this.nextBlobUid++,
      owner,
      comp: c,
      lastSeen: step,
      detachedSince,
      x: 0,
      y: 0,
      mass: 0,
    };
    owner.blobs.push(b);
    return b;
  }

  /** Assigns every valid component of this frame to a blob. Returns newborn tracks. */
  private trackBlobs(snap: FieldSnapshot, step: number, R: number): Track[] {
    const nc = this.nComps;
    const { value } = snap;
    const s = snap.scale;
    const compBlob = this.compBlob;
    compBlob.length = nc;
    for (let c = 0; c < nc; c++) compBlob[c] = null;
    for (const t of this.tracks) for (const b of t.blobs) b.comp = -1;

    const prevBlob = this.prevCompBlob;
    const np = this.hasPrev ? prevBlob.length : 0;

    // Overlap between this frame's components and the previous frame's (matter-weighted).
    const pairC: number[] = [];
    const pairP: number[] = [];
    const pairO: number[] = [];
    if (np > 0) {
      const ovl = this.ovl;
      const prevLab = this.prevLab;
      const touched: number[] = [];
      for (let c = 0; c < nc; c++) {
        if (!this.compValid[c]) continue;
        for (let k = this.compStart[c], e = this.compEnd[c]; k < e; k++) {
          const cell = this.cellIdx[k];
          const p = prevLab[cell];
          if (p < 0 || !prevBlob[p]) continue;
          if (ovl[p] === 0) touched.push(p);
          ovl[p] += value[cell] + 1e-6;
        }
        for (const p of touched) {
          pairC.push(c);
          pairP.push(p);
          pairO.push(ovl[p]);
          ovl[p] = 0;
        }
        touched.length = 0;
      }
    }
    const mainChild = new Int32Array(Math.max(np, 1)).fill(-1);
    const mainChildOv = new Float64Array(Math.max(np, 1));
    const mainParent = new Int32Array(Math.max(nc, 1)).fill(-1);
    const mainParentOv = new Float64Array(Math.max(nc, 1));
    for (let i = 0; i < pairC.length; i++) {
      const c = pairC[i];
      const p = pairP[i];
      const o = pairO[i];
      if (o > mainChildOv[p]) {
        mainChildOv[p] = o;
        mainChild[p] = c;
      }
      if (o > mainParentOv[c]) {
        mainParentOv[c] = o;
        mainParent[c] = p;
      }
    }
    // Continuation: a component continues the previous blob it is the main child of
    // (with the largest overlap if several).
    const contOv = new Float64Array(Math.max(nc, 1));
    const cont = new Int32Array(Math.max(nc, 1)).fill(-1);
    for (let i = 0; i < pairC.length; i++) {
      const c = pairC[i];
      const p = pairP[i];
      if (mainChild[p] === c && pairO[i] > contOv[c]) {
        contOv[c] = pairO[i];
        cont[c] = p;
      }
    }
    for (let c = 0; c < nc; c++) {
      if (cont[c] < 0) continue;
      const b = prevBlob[cont[c]]!;
      b.comp = c;
      b.lastSeen = step;
      compBlob[c] = b;
    }
    // Splits: a component overlapping a previous blob that continued elsewhere is a fragment.
    for (let c = 0; c < nc; c++) {
      if (!this.compValid[c] || compBlob[c] || mainParent[c] < 0) continue;
      const parent = prevBlob[mainParent[c]]!;
      compBlob[c] = this.newBlob(parent.owner, c, step, step);
    }
    // Merges: other previous blobs whose main child is this component end here.
    const mergedInto = new Map<Blob, Blob[]>();
    for (let i = 0; i < pairC.length; i++) {
      const c = pairC[i];
      const p = pairP[i];
      if (mainChild[p] !== c || cont[c] === p) continue;
      const gone = prevBlob[p]!;
      const into = compBlob[c]!;
      if (gone === into) continue;
      let list = mergedInto.get(into);
      if (!list) mergedInto.set(into, (list = []));
      list.push(gone);
    }
    for (const [into, goneList] of mergedInto) this.resolveMerge(into, goneList, step);

    // Fallback: unmatched components vs. recently lost blobs, by predicted centroid.
    const lost: Blob[] = [];
    for (const t of this.tracks) {
      for (const b of t.blobs) if (b.comp < 0 && step - b.lastSeen <= this.deadAfter + 10) lost.push(b);
    }
    const newborn: Track[] = [];
    const order: number[] = [];
    for (let c = 0; c < nc; c++) if (this.compValid[c] && !compBlob[c]) order.push(c);
    order.sort((a, b) => this.compMass[b] - this.compMass[a]);
    for (const c of order) {
      const cx = (this.compCx[c] + 0.5) * s;
      const cy = (this.compCy[c] + 0.5) * s;
      const m = this.compMass[c] * s * s;
      let best: Blob | null = null;
      let bestD = Infinity;
      for (const b of lost) {
        if (b.comp >= 0) continue;
        const dtSteps = step - b.lastSeen;
        const px = b.x + b.owner.vx * dtSteps;
        const py = b.y + b.owner.vy * dtSteps;
        const d = Math.hypot(wrapDelta(cx - px, snap.gridW), wrapDelta(cy - py, snap.gridH));
        const ratio = m / Math.max(1e-9, b.mass);
        if (d < Math.max(0.75 * R, 4 * s) && ratio > 1 / 3 && ratio < 3 && d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        best.comp = c;
        best.lastSeen = step;
        compBlob[c] = best;
      } else {
        const t = this.newTrack(step, null);
        compBlob[c] = this.newBlob(t, c, step, -1);
        this.tracks.push(t);
        newborn.push(t);
      }
    }

    // Forget blobs unseen for too long; record positions of the visible ones.
    for (const t of this.tracks) {
      t.blobs = t.blobs.filter((b) => b.comp >= 0 || step - b.lastSeen < this.deadAfter);
      for (const b of t.blobs) {
        if (b.comp < 0) continue;
        b.x = (this.compCx[b.comp] + 0.5) * s;
        b.y = (this.compCy[b.comp] + 0.5) * s;
        b.mass = this.compMass[b.comp] * s * s;
      }
    }
    return newborn;
  }

  /**
   * Blobs in `gone` merged into the component now carried by `into`. If they belong
   * to other creatures, those creatures fuse: the dominant one keeps the component,
   * the others are remembered (absorbed) in case they come apart again.
   */
  private resolveMerge(into: Blob, gone: Blob[], step: number): void {
    const owners = new Set<Track>([into.owner]);
    for (const g of gone) owners.add(g.owner);
    // Remove the merged blobs from their owners.
    for (const g of gone) {
      g.owner.blobs = g.owner.blobs.filter((b) => b !== g);
      g.comp = -1;
    }
    if (owners.size === 1) return;
    const rank = (t: Track) =>
      (t.state === 'stable' ? 4e12 : t.state === 'born' ? 2e12 : 0) + (step - t.birthStep) * 1e3 + t.mass;
    let dom = into.owner;
    for (const t of owners) if (rank(t) > rank(dom)) dom = t;
    if (dom !== into.owner) {
      into.owner.blobs = into.owner.blobs.filter((b) => b !== into);
      into.owner = dom;
      into.detachedSince = -1;
      dom.blobs.push(into);
    }
    dom.fusedAt = step;
    dom.structAt = step;
    for (const t of owners) {
      if (t === dom || t.blobs.length > 0) continue;
      dom.absorbed.push({ track: t, at: step });
      for (const a of t.absorbed) dom.absorbed.push(a);
      t.absorbed = [];
      t.blobs = [];
      t.fused = true;
    }
  }

  // ───────────────────────── per-creature update ─────────────────────────

  /** Returns false when the track must be dropped (dead or fused). */
  private processTrack(
    t: Track,
    snap: FieldSnapshot,
    step: number,
    R: number,
    fill: number,
    dishCells: number,
    events: DetectorEvent[],
    spawned: Track[] | null,
  ): boolean {
    if (t.fused) return false;

    // Expire memories of fused creatures.
    if (t.absorbed.length) {
      t.absorbed = t.absorbed.filter((a) => {
        if (step - a.at <= this.divideConfirm * 2) return true;
        events.push({ type: 'died', id: a.track.id, x: t.x, y: t.y });
        return false;
      });
    }

    const vis = t.blobs.filter((b) => b.comp >= 0);
    if (vis.length === 0) {
      if (step - t.lastSeen >= this.deadAfter || t.blobs.length === 0) {
        if (t.measured) events.push({ type: 'died', id: t.id, x: t.x, y: t.y });
        for (const a of t.absorbed) events.push({ type: 'died', id: a.track.id, x: t.x, y: t.y });
        return false;
      }
      return true; // briefly unseen: keep last values
    }
    t.lastSeen = step;

    // Core = heaviest attached blob; other attached blobs start counting as detached.
    let core: Blob | null = null;
    for (const b of vis) if (b.detachedSince < 0 && (!core || b.mass > core.mass)) core = b;
    if (!core) {
      for (const b of vis) if (!core || b.mass > core.mass) core = b;
      core!.detachedSince = -1;
    }
    for (const b of vis) if (b !== core && b.detachedSince < 0) b.detachedSince = step;

    // Fragments that proved independent become creatures of their own.
    const before = t.mass;
    let shed = false;
    if (spawned) {
      for (const b of vis) {
        if (b === core) continue;
        const apart = step - b.detachedSince;
        const dist = Math.hypot(wrapDelta(b.x - core!.x, snap.gridW), wrapDelta(b.y - core!.y, snap.gridH));
        if (apart < this.divideConfirm && !(apart >= this.divideConfirm / 5 && dist > 3 * R)) continue;
        t.blobs = t.blobs.filter((x) => x !== b);
        // A creature that fused into this one and now comes apart again keeps its id.
        let restore = -1;
        let bestRatio = Infinity;
        t.absorbed.forEach((a, i) => {
          const r = Math.abs(Math.log(Math.max(1e-9, b.mass) / Math.max(1e-9, a.track.mass)));
          if (r < Math.log(2) && r < bestRatio) {
            bestRatio = r;
            restore = i;
          }
        });
        let child: Track;
        if (restore >= 0) {
          child = t.absorbed[restore].track;
          t.absorbed.splice(restore, 1);
          child.hist.clear();
          child.fused = false;
        } else {
          child = this.newTrack(b.detachedSince, t.id);
          child.fromFission = t.state === 'stable';
          t.childIds.push(child.id);
          t.lastDivision = step;
          events.push({ type: 'divided', parentId: t.id, childIds: [child.id], x: t.x, y: t.y });
          child.announce = true;
        }
        shed = true;
        child.blobs = [b];
        child.lastSeen = step;
        b.owner = child;
        b.detachedSince = -1;
        spawned.push(child);
      }
    }
    const vis2 = shed ? t.blobs.filter((b) => b.comp >= 0) : vis;
    if (vis2.length === 0) return false;

    this.measure(t, vis2, core!, snap, step);
    if (t.announce) {
      t.announce = false;
      events.push({ type: 'born', id: t.id, x: t.x, y: t.y });
    }
    // Keep the mass history continuous across divisions and fusions (the mass ratio
    // test must not see the creature "shrink" or "explode" because of them).
    if ((shed || t.fusedAt === step) && before > 0 && t.hist.count > 1) {
      t.hist.scaleField(F_MASS, t.mass / before);
    }
    if (shed) t.structAt = step;

    // ── states ──
    const age = step - t.birthStep;
    let trig =
      t.mass > EXPLODE_DISH_FRAC * dishCells ||
      t.mass > EXPLODE_MASS_R2 * R * R ||
      (fill > DISH_FILL_EXPLODE && t.area > BIG_BLOB_DISH_FRAC * dishCells);
    const qr = this.quarterRatio(t, step);
    if (qr > 3) trig = true;
    if (trig) t.explodedAt = step;
    let next: CreatureState;
    if (step - t.explodedAt < this.explodeSticky) next = 'exploded';
    else {
      const calm = !(qr < 0.5);
      if (t.state === 'stable') next = calm ? 'stable' : 'born';
      else if (age >= this.stableAge && calm && t.coreShare >= DOMINANT_SHARE) next = 'stable';
      else next = 'born';
    }
    if (next !== t.state) {
      if (next === 'stable') events.push({ type: 'stable', id: t.id, x: t.x, y: t.y });
      else if (next === 'exploded') {
        events.push({ type: 'exploded', id: t.id, x: t.x, y: t.y });
        t.behavior = null;
        t.cand = null;
      }
      t.state = next;
    }
    return true;
  }

  /** Mass of the last quarter of the window over the second quarter (NaN if too young). */
  private quarterRatio(t: Track, step: number): number {
    const h = t.hist;
    if (h.count < 8) return NaN;
    const span = Math.min(this.window, step - h.get(0, F_STEP));
    if (span < 500) return NaN;
    const q = span / 4;
    let a = 0;
    let na = 0;
    let b = 0;
    let nb = 0;
    for (let k = h.count - 1; k >= 0; k--) {
      const age = step - h.get(k, F_STEP);
      if (age > span) break;
      if (age <= q) {
        a += h.get(k, F_MASS);
        na++;
      } else if (age > 2 * q && age <= 3 * q) {
        b += h.get(k, F_MASS);
        nb++;
      }
    }
    if (!na || !nb || b <= 0) return NaN;
    return a / na / (b / nb);
  }

  /** Group measurements over the creature's visible blobs + history sample. */
  private measure(t: Track, vis: Blob[], core: Blob, snap: FieldSnapshot, step: number): void {
    const { w, h, value, grad } = snap;
    const s = snap.scale;
    const coreC = vis.includes(core) ? core.comp : vis[0].comp;
    const ccx = this.compCx[coreC];
    const ccy = this.compCy[coreC];
    let M = 0;
    let ax = 0;
    let ay = 0;
    let coreMass = 0;
    for (const b of vis) {
      const c = b.comp;
      const m = this.compMass[c];
      M += m;
      ax += m * wrapDelta(this.compCx[c] - ccx, w);
      ay += m * wrapDelta(this.compCy[c] - ccy, h);
      if (b === core) coreMass = m;
    }
    const gcx = mod(ccx + ax / M, w);
    const gcy = mod(ccy + ay / M, h);
    let ixx = 0;
    let iyy = 0;
    let gs = 0;
    let sv2 = 0;
    let area = 0;
    let S = 0;
    let m1r = 0, m1i = 0, m2r = 0, m2i = 0, m3r = 0, m3i = 0;
    let m4r = 0, m4i = 0, m5r = 0, m5i = 0, m6r = 0, m6i = 0;
    const cellIdx = this.cellIdx;
    const cellUx = this.cellUx;
    const cellUy = this.cellUy;
    const thr = this.thr;
    for (const b of vis) {
      const c = b.comp;
      const offx = wrapDelta(this.compCx[c] - gcx, w) - this.compUx[c];
      const offy = wrapDelta(this.compCy[c] - gcy, h) - this.compUy[c];
      const e = this.compEnd[c];
      for (let k = this.compStart[c]; k < e; k++) {
        const cell = cellIdx[k];
        const v = value[cell];
        if (v >= thr) area++;
        gs += grad[cell];
        sv2 += v * v;
        const dx = cellUx[k] + offx;
        const dy = cellUy[k] + offy;
        const r2 = dx * dx + dy * dy;
        ixx += v * dx * dx;
        iyy += v * dy * dy;
        if (r2 < 1e-12) continue;
        const r = Math.sqrt(r2);
        const ux = dx / r;
        const uy = dy / r;
        const wv = v * r2;
        S += wv;
        // u^n by repeated complex multiplication
        let pr = ux;
        let pi = uy;
        m1r += wv * pr;
        m1i += wv * pi;
        let tr = pr * ux - pi * uy;
        pi = pr * uy + pi * ux;
        pr = tr;
        m2r += wv * pr;
        m2i += wv * pi;
        tr = pr * ux - pi * uy;
        pi = pr * uy + pi * ux;
        pr = tr;
        m3r += wv * pr;
        m3i += wv * pi;
        tr = pr * ux - pi * uy;
        pi = pr * uy + pi * ux;
        pr = tr;
        m4r += wv * pr;
        m4i += wv * pi;
        tr = pr * ux - pi * uy;
        pi = pr * uy + pi * ux;
        pr = tr;
        m5r += wv * pr;
        m5i += wv * pi;
        tr = pr * ux - pi * uy;
        pi = pr * uy + pi * ux;
        pr = tr;
        m6r += wv * pr;
        m6i += wv * pi;
      }
    }
    // The gradient of the outermost rim lives in cells too faint to be labeled: add
    // the gradient of the 1-cell ring around the creature (each cell once).
    gs += this.rimGradient(vis, snap);
    const s2 = s * s;
    const x = mod((gcx + 0.5) * s, snap.gridW);
    const y = mod((gcy + 0.5) * s, snap.gridH);
    if (!t.measured || t.hist.count === 0) {
      t.ux = x;
      t.uy = y;
    } else {
      t.ux += wrapDelta(x - t.x, snap.gridW);
      t.uy += wrapDelta(y - t.y, snap.gridH);
    }
    t.x = x;
    t.y = y;
    t.mass = M * s2;
    t.area = area * s2;
    t.grad = gs * s2;
    t.rg = Math.sqrt(Math.max(0, ((ixx + iyy) / Math.max(1e-12, M)) * s2 + (s2 - 1) / 6));
    t.coreShare = M > 0 ? coreMass / M : 1;
    t.dens = M > 0 ? sv2 / M : 0;

    const rec = this.rec;
    const ms = [m1r, m1i, m2r, m2i, m3r, m3i, m4r, m4i, m5r, m5i, m6r, m6i];
    const fresh = !t.measured || t.hist.count === 0;
    for (let n = 1; n <= NH; n++) {
      const re = ms[2 * n - 2];
      const im = ms[2 * n - 1];
      rec[F_H + n - 1] = S > 0 ? Math.hypot(re, im) / S : 0;
      const ph = Math.atan2(im, re);
      if (!fresh) t.rot[n] += wrapPi(ph - t.phase[n]) / n;
      t.phase[n] = ph;
      rec[F_ROT + n - 1] = t.rot[n];
    }
    rec[F_STEP] = step;
    rec[F_MASS] = t.mass;
    rec[F_UX] = t.ux;
    rec[F_UY] = t.uy;
    rec[F_RG] = t.rg;
    rec[F_AREA] = t.area;
    rec[F_DENS] = t.dens;
    rec[F_GRAD] = t.grad;
    rec[F_PARTS] = vis.length;
    t.hist.push(rec);
    t.measured = true;

    // Velocity over the last ~50 steps.
    const hist = t.hist;
    let k = hist.count - 1;
    while (k > 0 && step - hist.get(k, F_STEP) < 50) k--;
    const dts = step - hist.get(k, F_STEP);
    if (dts > 0) {
      t.vx = (t.ux - hist.get(k, F_UX)) / dts;
      t.vy = (t.uy - hist.get(k, F_UY)) / dts;
    }
  }

  private rimGradient(vis: Blob[], snap: FieldSnapshot): number {
    const { w, h, grad } = snap;
    const lab = this.lab;
    const stampArr = this.rimStamp;
    const st = ++this.stamp;
    let g = 0;
    for (const b of vis) {
      const c = b.comp;
      for (let k = this.compStart[c], e = this.compEnd[c]; k < e; k++) {
        const cell = this.cellIdx[k];
        const x = cell % w;
        const y = (cell - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          let ny = y + dy;
          if (ny < 0) ny += h;
          else if (ny >= h) ny -= h;
          for (let dx = -1; dx <= 1; dx++) {
            let nx = x + dx;
            if (nx < 0) nx += w;
            else if (nx >= w) nx -= w;
            const q = ny * w + nx;
            if (lab[q] !== -1 || stampArr[q] === st) continue;
            stampArr[q] = st;
            g += grad[q];
          }
        }
      }
    }
    return g;
  }

  // ───────────────────────── behaviours ─────────────────────────

  private analyzeMotion(t: Track, step: number, R: number): Motion | null {
    const h = t.hist;
    const k0 = h.firstSince(Math.max(step - this.window, t.structAt));
    const n = h.count - k0;
    if (n < 16) return null;
    const T = h.get(h.count - 1, F_STEP) - h.get(k0, F_STEP);
    if (T <= 0) return null;
    // Net and path displacement over ~50-step chunks.
    const net = Math.hypot(h.get(h.count - 1, F_UX) - h.get(k0, F_UX), h.get(h.count - 1, F_UY) - h.get(k0, F_UY)) / T;
    let path = 0;
    const heads: number[] = [];
    let kPrev = k0;
    for (let k = k0 + 1; k < h.count; k++) {
      if (h.get(k, F_STEP) - h.get(kPrev, F_STEP) < 50 && k < h.count - 1) continue;
      const dx = h.get(k, F_UX) - h.get(kPrev, F_UX);
      const dy = h.get(k, F_UY) - h.get(kPrev, F_UY);
      const d = Math.hypot(dx, dy);
      path += d;
      if (d > 0.05 * R) heads.push(Math.atan2(dy, dx));
      kPrev = k;
    }
    const speed = path / T;
    let turnHead = 0;
    if (speed * this.window > R && heads.length >= 4) {
      let acc = 0;
      for (let i = 1; i < heads.length; i++) acc += wrapPi(heads[i] - heads[i - 1]);
      turnHead = acc / T;
    }
    // Body rotation through the strongest angular harmonic.
    let bestAmp = 0;
    let bestN = 1;
    for (let hn = 0; hn < NH; hn++) {
      let a = 0;
      for (let k = k0; k < h.count; k++) a += h.get(k, F_H + hn);
      a /= n;
      if (a > bestAmp) {
        bestAmp = a;
        bestN = hn;
      }
    }
    const turnBody = (h.get(h.count - 1, F_ROT + bestN) - h.get(k0, F_ROT + bestN)) / T;

    // Pulsation: DFT of the linearly detrended mass series.
    let mean = 0;
    let sk = 0;
    let skk = 0;
    let skm = 0;
    for (let i = 0; i < n; i++) {
      const m = h.get(k0 + i, F_MASS);
      mean += m;
      sk += i;
      skk += i * i;
      skm += i * m;
    }
    mean /= n;
    const den = n * skk - sk * sk;
    const slope = den !== 0 ? (n * skm - sk * mean * n) / den : 0;
    const icpt = mean - (slope * sk) / n;
    const res = new Float64Array(n);
    let varTot = 0;
    for (let i = 0; i < n; i++) {
      res[i] = h.get(k0 + i, F_MASS) - (icpt + slope * i);
      varTot += res[i] * res[i];
    }
    let bestP = 0;
    let bestK = 0;
    for (let kf = 2; kf <= n >> 1; kf++) {
      const ang = (TWO_PI * kf) / n;
      const cr = Math.cos(ang);
      const ci = Math.sin(ang);
      let wr = 1;
      let wi = 0;
      let xr = 0;
      let xi = 0;
      for (let i = 0; i < n; i++) {
        xr += res[i] * wr;
        xi -= res[i] * wi;
        const tr = wr * cr - wi * ci;
        wi = wr * ci + wi * cr;
        wr = tr;
      }
      const p = xr * xr + xi * xi;
      if (p > bestP) {
        bestP = p;
        bestK = kf;
      }
    }
    const amp = bestK ? (2 * Math.sqrt(bestP)) / n : 0;
    const pulseAmp = mean > 0 ? amp / mean : 0;
    // Parseval: Σ_k |X_k|² over all k = n Σ res²; one-sided peak share of the variance.
    const pulseDominance = varTot > 0 ? Math.min(1, (2 * bestP) / (n * varTot)) : 0;
    const dtSample = T / (n - 1);
    const pulsePeriod = bestK ? (n * dtSample) / bestK : 0;
    return { speed, net, turnHead, turnBody, bodyAmp: bestAmp, pulseAmp, pulseDominance, pulsePeriod };
  }

  private classify(step: number, R: number, params: LeniaParams, snap: FieldSnapshot, events: DetectorEvent[]): void {
    const fullTurn = TWO_PI / this.window;
    const cands = new Map<Track, Behavior>();
    const classifiable: Track[] = [];
    for (const t of this.tracks) {
      if (t.state !== 'stable' || step - t.birthStep < this.classifyAge || t.lastSeen !== step) continue;
      const mo = this.analyzeMotion(t, step, R);
      if (!mo) continue;
      t.motion = mo;
      classifiable.push(t);
      let b: Behavior;
      const swim = mo.net * this.window > 4 * R;
      const spinHead = mo.speed * this.window > R && Math.abs(mo.turnHead) >= fullTurn;
      const spinBody = mo.bodyAmp >= 0.05 && Math.abs(mo.turnBody) >= fullTurn;
      if (spinHead || spinBody) b = 'spinner';
      else if (swim) b = 'swimmer';
      else if (mo.pulseAmp > 0.05 && mo.pulseDominance > 0.25) b = 'pulsing';
      else b = 'still';
      // Divider: recent division with a stable child, or a stable child of a true fission.
      if (step - t.lastDivision < this.dividerMemory) {
        if (this.tracks.some((c) => c.parentId === t.id && c.state === 'stable')) b = 'divider';
      }
      if (t.fromFission && step - t.birthStep < this.dividerMemory) b = 'divider';
      cands.set(t, b);
    }
    // Colony: ≥ 3 classified stable creatures of the same species within 3R of each
    // other. Neighbours squeeze and slow each other down, so the comparison uses the
    // static (shape) signature with a looser threshold.
    if (classifiable.length >= 3) {
      const parent = classifiable.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const sigs = classifiable.map((t) => this.signatureOf(t, R, params).map((v, i) => (i >= SIG.SPEED ? SIG_UNKNOWN : v)));
      for (let i = 0; i < classifiable.length; i++) {
        for (let j = i + 1; j < classifiable.length; j++) {
          const a = classifiable[i];
          const b = classifiable[j];
          const d = Math.hypot(wrapDelta(a.x - b.x, snap.gridW), wrapDelta(a.y - b.y, snap.gridH));
          if (d > 3 * R) continue;
          if (signatureDistance(sigs[i], sigs[j]) >= COLONY_MATCH * SPECIES_MATCH_THRESHOLD) continue;
          parent[find(i)] = find(j);
        }
      }
      const size = new Map<number, number>();
      for (let i = 0; i < classifiable.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
      for (let i = 0; i < classifiable.length; i++) {
        if ((size.get(find(i)) ?? 0) >= 3) cands.set(classifiable[i], 'colony');
      }
    }
    // Apply with hysteresis: a change must be seen twice in a row.
    for (const [t, b] of cands) {
      if (t.behavior === b) {
        t.cand = null;
        t.candCount = 0;
        continue;
      }
      if (t.behavior !== null) {
        if (t.cand === b) t.candCount++;
        else {
          t.cand = b;
          t.candCount = 1;
        }
        if (t.candCount < 2) continue;
      }
      t.behavior = b;
      t.cand = null;
      t.candCount = 0;
      events.push({ type: 'behavior', id: t.id, behavior: b, x: t.x, y: t.y });
    }
  }

  // ───────────────────────── signature ─────────────────────────

  private signatureOf(t: Track, R: number, params: LeniaParams): number[] {
    const sig = new Array<number>(SIG_LENGTH).fill(SIG_UNKNOWN);
    const h = t.hist;
    if (h.count === 0) return sig;
    const last = h.get(h.count - 1, F_STEP);
    const k0 = Math.min(h.firstSince(Math.max(last - STATIC_SPAN, t.structAt)), h.count - 1);
    const n = h.count - k0;
    let mass = 0;
    let rg = 0;
    let dens = 0;
    let grad = 0;
    let parts = 0;
    const hs = new Float64Array(NH);
    for (let k = k0; k < h.count; k++) {
      mass += h.get(k, F_MASS);
      rg += h.get(k, F_RG);
      dens += h.get(k, F_DENS);
      grad += h.get(k, F_GRAD);
      parts += h.get(k, F_PARTS);
      for (let j = 0; j < NH; j++) hs[j] += h.get(k, F_H + j);
    }
    mass /= n;
    sig[SIG.MASS] = mass / (R * R);
    sig[SIG.RG] = rg / n / R;
    sig[SIG.DENSITY] = dens / n;
    sig[SIG.EDGE] = mass > 0 ? ((grad / n) * R) / mass : 0;
    for (let j = 0; j < NH; j++) sig[SIG.H1 + j] = hs[j] / n;
    sig[SIG.PARTS] = parts / n;
    const mo = t.motion;
    if (mo && t.behavior !== null) {
      const T = 1 / Math.max(1e-6, params.dt);
      sig[SIG.SPEED] = (mo.speed * T) / R;
      const turn = Math.max(mo.speed * this.window > R ? Math.abs(mo.turnHead) : 0, mo.bodyAmp >= 0.05 ? Math.abs(mo.turnBody) : 0);
      sig[SIG.TURN] = turn * T;
      sig[SIG.PULSE] = mo.pulseAmp;
      sig[SIG.FREQ] = mo.pulsePeriod > 0 ? T / mo.pulsePeriod : 0;
    }
    return sig;
  }
}

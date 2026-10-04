/**
 * The secrets observer. Listens to the game bus, polls the GameView about once a second, and
 * receives a few explicit input hooks from the UI. Finds secrets, persists them, and tells the
 * rest of the game through its own small emitter:
 *   found / effect / unlockCosmetic / grantJournal / allFound / progress / colormap.
 *
 * It never touches the simulation and never pays more than BONUS_CAP (+10 %) Essence.
 * Spoilers: docs/SECRETS.md.
 */
import { Bus, type GameEvents } from '../core/bus';
import type { CreatureView, GameView, Text } from '../core/types';
import {
  ABYSS_UNLOCK,
  AFK_S,
  ANSWER_SEEDS,
  AURORA_DURATION_S,
  AURORA_MEAN_S,
  AURORA_MIN_PLAYTIME_S,
  AURORA_MIN_STABLE,
  AURORA_REPEAT_MEAN_S,
  BASEMENT_UNLOCK,
  BIRTHDAYS,
  BONUS_CAP,
  BONUS_PER_SECRET,
  CHAN_NAMES,
  COLORMAPS,
  CONWAY_NAMES,
  COSMETIC_IDS,
  EXACT_ESSENCE,
  GESTURE_MIN_CELLS,
  GOLDEN_STREAK,
  JOURNAL_VARIANTS,
  KONAMI_KEYS,
  KONAMI_SWIPES,
  KONAMI_SWIPE_WINDOW_MS,
  LOGO_GAP_MS,
  LOGO_TAPS,
  LONG_PRESS_MS,
  MAXIMIZER_EXPLOSIONS,
  MAXIMIZER_WINDOW_S,
  MAX_POLL_DT,
  OLD_FRIEND_S,
  ORION_COLLINEAR,
  ORION_EVEN,
  ORION_MIN_PLAYTIME_S,
  ORION_POLLS,
  ORION_REPEAT_S,
  ORION_SPACING,
  PALINDROME_MIN_DIGITS,
  POLL_MS,
  RENAME_QUIPS,
  SECRET_DEFS,
  SECRET_IDS,
  SEVEN,
  SILENCE_S,
  TOTAL_SECRETS,
  WHISPERS,
  secretDef,
} from './data';
import { pointInPolygon, recognize, resample, swipeDirection } from './gestures';
import { FULL_MOON_ILLUMINATION, moonInfo } from './moon';
import { CATALOG } from '../sim/catalog';
import { catalogGroup } from '../species/identity';
import { cryptidAwake, SECRET_REGIMES } from './regimes';
import type {
  CosmeticId,
  GridPt,
  MoteHue,
  SecretDef,
  SecretEffect,
  SecretEvents,
  SecretId,
  SecretsSave,
  SecretView,
  StorageLike,
  TimedPt,
} from './types';

export const STORAGE_KEY = 'bioluma.secrets';

export interface SecretsDeps {
  bus: Bus<GameEvents>;
  getView: () => GameView;
  /** Persistence. Default: window.localStorage (guarded). Pass null to disable. */
  storage?: StorageLike | null;
  now?: () => Date;
  rng?: () => number;
  /** Poll the view every POLL_MS with setInterval (default true). Tests pass false and call tick(). */
  autoPoll?: boolean;
  /**
   * Centre of the round dish in grid cells (where the Conway glider starts). The dish is walled
   * (ADR-025): strokes and distances are plain, nothing wraps.
   */
  center?: { x: number; y: number };
  storageKey?: string;
}

export interface Secrets {
  readonly total: number;
  on<K extends keyof SecretEvents>(type: K, fn: (payload: SecretEvents[K]) => void): () => void;
  /** One poll of the view (called automatically every ~1 s unless autoPoll is false). */
  tick(): void;

  // ── Input hooks the UI calls ──
  /** Every keydown on desktop (KeyboardEvent.key). */
  onKey(key: string): void;
  /** A tap/click on the BIOLUMA wordmark or logo. */
  onLogoTap(): void;
  /** The essence counter was held for `ms` milliseconds (call on release, or when it reaches 5 s). */
  onEssenceLongPress(ms: number): void;
  /** One finished stroke drawn on the dish with the brush or the eraser, in GRID cells. */
  onBrushPath(points: TimedPt[]): void;
  /** The player renamed a species (raw text as typed). */
  onSpeciesRenamed(name: string): void;
  /** A shake was detected (DeviceMotion, mouse jiggle or window jiggle; see ui/secrets/inputs). */
  onDeviceShake(): void;
  /** The game was paused / resumed by the player. */
  setPaused(paused: boolean): void;
  /** The "Laboratorio del sótano" page was opened. */
  onBasementOpened(): void;

  // ── Queries ──
  list(): SecretView[];
  get(id: SecretId): SecretView;
  isFound(id: SecretId): boolean;
  foundCount(): number;
  /** 1 + min(BONUS_CAP, BONUS_PER_SECRET × found). Multiply into M_global. */
  bonusMultiplier(): number;
  /** The additive part (0..BONUS_CAP). */
  bonus(): number;
  basementUnlocked(): boolean;
  cosmetics(): CosmeticId[];
  colormap(): CosmeticId | null;
  /** Pick an unlocked colormap (null = default). Emits `colormap`. */
  setColormap(id: CosmeticId | null): boolean;
  /** Reveal the next hint tier of a hidden secret (free). */
  revealHint(id: SecretId): SecretView;
  /** A cryptic tier-0 hint of a random undiscovered secret (for the story / journal). */
  rumor(): { id: SecretId; text: Text } | null;

  // ── Persistence ──
  serialize(): SecretsSave;
  load(data: unknown): void;
  /** Forget everything (debug / "delete save"). */
  reset(): void;
  /** Dev / tests only: mark a secret found as if triggered. */
  forceFind(id: SecretId): void;
  dispose(): void;
}

function emptySave(): SecretsSave {
  return { v: 1, found: {}, hints: {}, cosmetics: [], colormap: null, manualSeeds: 0, goldenStreak: 0, hadLife: false, allFoundEmitted: false };
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/** Lowercase, no accents, single spaces, no surrounding quotes/punctuation. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[«»"'“”‘’.,;:!¡?¿()[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isPalindromeNumber(n: number, minDigits = PALINDROME_MIN_DIGITS): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  const s = String(Math.floor(n));
  if (s.length < minDigits || s.includes('e')) return false;
  for (let i = 0, j = s.length - 1; i < j; i++, j--) if (s[i] !== s[j]) return false;
  return true;
}

function groupDigits(n: number, sep: string): string {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Exact essence for the long-press whisper: all digits, three decimals. */
export function exactEssenceText(e: number): Text {
  const frac = Math.floor((e - Math.floor(e)) * 1000)
    .toString()
    .padStart(3, '0');
  return { es: `${groupDigits(e, ' ')},${frac}`, en: `${groupDigits(e, ',')}.${frac}` };
}

const living = (v: GameView): CreatureView[] => v.creatures.filter((c) => c.state !== 'dead');

export function createSecrets(deps: SecretsDeps): Secrets {
  const emitter = new Bus<SecretEvents>();
  const now = deps.now ?? (() => new Date());
  const rng = deps.rng ?? Math.random;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const key = deps.storageKey ?? STORAGE_KEY;
  const center = deps.center ?? { x: 96, y: 120 };

  let save: SecretsSave = emptySave();

  // ── runtime (not persisted) ──
  let lastTick: number | null = null;
  const aliveFor = new Map<number, number>();
  let emptyFor = 0;
  let explosions: number[] = [];
  let keyBuf: string[] = [];
  let swipes: { dir: string; t: number }[] = [];
  let logoTaps: number[] = [];
  let paused = false;
  let pausedSince: number | null = null;
  let orionStreak = 0;
  let lastOrionFx = -Infinity;
  let dirty = false;

  // ───────────── persistence ─────────────

  function persist(): void {
    dirty = false;
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(save));
    } catch {
      /* quota / private mode: secrets still work for this session */
    }
  }

  function sanitize(data: unknown): SecretsSave | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const out = emptySave();
    const ids = new Set<string>(SECRET_IDS);
    if (d.found && typeof d.found === 'object') {
      for (const [k, v] of Object.entries(d.found as Record<string, unknown>)) {
        if (ids.has(k) && typeof v === 'number' && Number.isFinite(v)) out.found[k as SecretId] = v;
      }
    }
    if (d.hints && typeof d.hints === 'object') {
      for (const [k, v] of Object.entries(d.hints as Record<string, unknown>)) {
        if (ids.has(k) && typeof v === 'number') out.hints[k as SecretId] = Math.max(0, Math.min(2, Math.floor(v)));
      }
    }
    if (Array.isArray(d.cosmetics)) out.cosmetics = d.cosmetics.filter((c): c is CosmeticId => (COSMETIC_IDS as readonly unknown[]).includes(c));
    if (typeof d.colormap === 'string' && (COSMETIC_IDS as readonly string[]).includes(d.colormap)) out.colormap = d.colormap as CosmeticId;
    if (typeof d.manualSeeds === 'number' && Number.isFinite(d.manualSeeds)) out.manualSeeds = Math.max(0, Math.floor(d.manualSeeds));
    if (typeof d.goldenStreak === 'number' && Number.isFinite(d.goldenStreak)) out.goldenStreak = Math.max(0, Math.floor(d.goldenStreak));
    out.hadLife = d.hadLife === true;
    out.allFoundEmitted = d.allFoundEmitted === true;
    return out;
  }

  /** Union of two saves: earliest discovery wins, highest counters/hints win. */
  function merge(a: SecretsSave, b: SecretsSave): SecretsSave {
    const out = emptySave();
    for (const id of SECRET_IDS) {
      const x = a.found[id];
      const y = b.found[id];
      if (x !== undefined || y !== undefined) out.found[id] = Math.min(x ?? Infinity, y ?? Infinity);
      const h = Math.max(a.hints[id] ?? 0, b.hints[id] ?? 0);
      if (h > 0) out.hints[id] = h;
    }
    out.cosmetics = COSMETIC_IDS.filter((c) => a.cosmetics.includes(c) || b.cosmetics.includes(c));
    out.colormap = b.colormap ?? a.colormap;
    out.manualSeeds = Math.max(a.manualSeeds, b.manualSeeds);
    out.goldenStreak = Math.max(a.goldenStreak, b.goldenStreak);
    out.hadLife = a.hadLife || b.hadLife;
    out.allFoundEmitted = a.allFoundEmitted || b.allFoundEmitted;
    return out;
  }

  /** Cosmetics are derived from what is found (repairs hand-edited or older saves). */
  function repairCosmetics(): void {
    const want = new Set<CosmeticId>();
    for (const d of SECRET_DEFS) if (d.cosmetic && save.found[d.id] !== undefined) want.add(d.cosmetic);
    if (count() >= ABYSS_UNLOCK) want.add('abyss');
    if (count() >= TOTAL_SECRETS) want.add('gilded');
    save.cosmetics = COSMETIC_IDS.filter((c) => want.has(c));
    if (save.colormap && !save.cosmetics.includes(save.colormap)) save.colormap = null;
  }

  function readStorage(): void {
    if (!storage) return;
    try {
      const raw = storage.getItem(key);
      if (!raw) return;
      const s = sanitize(JSON.parse(raw));
      if (s) save = s;
      repairCosmetics();
    } catch {
      /* corrupted entry: start clean, never crash the game */
    }
  }

  // ───────────── views ─────────────

  function count(): number {
    let n = 0;
    for (const id of SECRET_IDS) if (save.found[id] !== undefined) n++;
    return n;
  }

  function view(d: SecretDef): SecretView {
    const found = save.found[d.id];
    const level = Math.max(0, Math.min(2, save.hints[d.id] ?? 0));
    return {
      id: d.id,
      category: d.category,
      name: d.name,
      flavor: d.flavor,
      hint: d.hints[level],
      hints: d.hints.slice(0, level + 1),
      hintLevel: level,
      hintCount: d.hints.length,
      found: found !== undefined,
      foundAt: found ?? null,
      glyph: d.glyph,
      cosmetic: d.cosmetic ?? null,
      latin: d.latin ?? null,
      code: d.code ?? null,
      easy: d.easy === true,
    };
  }

  const bonus = () => Math.min(BONUS_CAP, BONUS_PER_SECRET * count());

  function emitProgress(): void {
    emitter.emit('progress', { found: count(), total: TOTAL_SECRETS, basementUnlocked: count() >= BASEMENT_UNLOCK, bonus: bonus() });
  }

  function unlockCosmetic(id: CosmeticId): void {
    if (save.cosmetics.includes(id)) return;
    save.cosmetics = COSMETIC_IDS.filter((c) => c === id || save.cosmetics.includes(c));
    emitter.emit('unlockCosmetic', { id, colormap: COLORMAPS[id] });
  }

  // ───────────── discovery ─────────────

  function fx(e: SecretEffect): void {
    emitter.emit('effect', e);
  }

  /** Mark a secret found. Returns false if it already was. */
  function find(id: SecretId, journal?: Text): boolean {
    if (save.found[id] !== undefined) return false;
    const def = secretDef(id);
    save.found[id] = now().getTime();
    const n = count();
    const v = view(def);
    emitter.emit('found', { secret: v, def, index: n, total: TOTAL_SECRETS, cue: `secret.${id}`, companion: def.companion });
    emitter.emit('grantJournal', { id: `secret.${id}`, text: journal ?? def.journal });
    if (def.cosmetic) unlockCosmetic(def.cosmetic);
    if (n >= ABYSS_UNLOCK) unlockCosmetic('abyss');
    if (n >= TOTAL_SECRETS && !save.allFoundEmitted) {
      save.allFoundEmitted = true;
      unlockCosmetic('gilded');
      emitter.emit('allFound', { total: TOTAL_SECRETS });
    }
    emitProgress();
    persist();
    return true;
  }

  function checkSterile(): void {
    if (save.found.sterile !== undefined) return;
    let v: GameView;
    try {
      v = deps.getView();
    } catch {
      return;
    }
    if (living(v).length === 0) {
      fx({ kind: 'motes', count: 30, hue: 'silver', duration: 6, from: 'center' });
      find('sterile');
    }
  }

  // ───────────── hidden species ─────────────

  const SPECIES_MOTES: Record<string, SecretEffect> = {
    ignis: { kind: 'motes', count: 70, hue: 'ember', duration: 6, from: 'bottom' },
    phantasma: { kind: 'motes', count: 50, hue: 'silver', duration: 7, from: 'center' },
    cryptid: { kind: 'motes', count: 60, hue: 'violet', duration: 7, from: 'top' },
  };

  /**
   * Latin names a hidden species can be registered under. The detector cannot tell some catalog
   * species apart (species/identity CATALOG_GROUPS): Pyroscutium ambiguus is one Bestiary species
   * with Discutium solidus, registered under whichever name the first match had.
   */
  const REGIME_NAMES: ReadonlyMap<SecretId, ReadonlySet<string>> = new Map(
    SECRET_REGIMES.map((r) => [
      r.secretId,
      new Set([r.name, ...CATALOG.filter((e) => catalogGroup(e.code) === catalogGroup(r.code)).map((e) => e.name)]),
    ]),
  );

  function checkSpecies(v: GameView): void {
    for (const r of SECRET_REGIMES) {
      if (save.found[r.secretId] !== undefined) continue;
      const names = REGIME_NAMES.get(r.secretId)!;
      const named = (id: string | null) => id !== null && names.has(v.species.find((s) => s.id === id)?.catalogName ?? '');
      // The cryptid keeps hours: one of its kind alive on the dish at night or under a full moon
      // (it lives in Mundo 5 · Discos, where it would otherwise be met by day, docs/CLARIDAD.md J-26).
      const seen =
        r.when === 'nightOrFullMoon'
          ? cryptidAwake(now()) && v.creatures.some((c) => c.state === 'stable' && named(c.speciesId))
          : v.species.some((s) => s.catalogName !== null && names.has(s.catalogName));
      if (seen) {
        fx(SPECIES_MOTES[r.secretId]);
        find(r.secretId);
      }
    }
  }

  // ───────────── geometry helpers ─────────────

  /** Delta from a to b (the round dish is walled: nothing wraps). */
  function delta(a: GridPt, b: GridPt): GridPt {
    return { x: b.x - a.x, y: b.y - a.y };
  }

  /** Three stable creatures in a row, evenly spaced (Orion's belt), or null. */
  function findBelt(cs: readonly CreatureView[]): GridPt[] | null {
    const list = cs.slice(0, 14);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        for (let k = j + 1; k < list.length; k++) {
          const tri = [list[i], list[j], list[k]];
          // Express all three relative to the first (unwrapped).
          const p = tri.map((c) => {
            const d = delta(tri[0], c);
            return { x: tri[0].x + d.x, y: tri[0].y + d.y };
          });
          const d01 = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
          const d02 = Math.hypot(p[2].x - p[0].x, p[2].y - p[0].y);
          const d12 = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
          // Outer pair = the farthest apart; the remaining one is the middle star.
          let a = p[0];
          let b = p[1];
          let m = p[2];
          let span = d01;
          if (d02 >= span && d02 >= d12) {
            b = p[2];
            m = p[1];
            span = d02;
          } else if (d12 >= span && d12 >= d02) {
            a = p[1];
            b = p[2];
            m = p[0];
            span = d12;
          }
          const g1 = Math.hypot(m.x - a.x, m.y - a.y);
          const g2 = Math.hypot(b.x - m.x, b.y - m.y);
          if (Math.min(g1, g2) < ORION_SPACING[0] || Math.max(g1, g2) > ORION_SPACING[1]) continue;
          if (Math.max(g1, g2) / Math.max(1e-9, Math.min(g1, g2)) > ORION_EVEN) continue;
          const off = Math.abs((b.x - a.x) * (a.y - m.y) - (a.x - m.x) * (b.y - a.y)) / Math.max(1e-9, span);
          if (off > ORION_COLLINEAR * span + 1) continue;
          return [a, m, b];
        }
    return null;
  }

  /** Order points around their centroid (a pleasant closed constellation). */
  function aroundCentroid(pts: GridPt[]): GridPt[] {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [...pts].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  }

  // ───────────── the poll ─────────────

  let lastMoonCheck = -Infinity;

  function tick(): void {
    const date = now();
    const t = date.getTime();
    const dt = lastTick === null ? 0 : Math.max(0, Math.min(MAX_POLL_DT, (t - lastTick) / 1000));
    lastTick = t;
    let v: GameView;
    try {
      v = deps.getView();
    } catch {
      return;
    }
    checkSpecies(v);

    const alive = living(v);
    const stable = alive.filter((c) => c.state === 'stable');
    if (stable.length && !save.hadLife) {
      save.hadLife = true;
      dirty = true;
    }

    // Siete de siete: exactly seven, all stable, seven species.
    if (save.found.seven === undefined && alive.length === SEVEN && stable.length === SEVEN) {
      const sp = new Set(stable.map((c) => c.speciesId));
      if (!sp.has(null) && sp.size === SEVEN) {
        fx({ kind: 'constellation', points: aroundCentroid(stable.map((c) => ({ x: c.x, y: c.y }))), label: WHISPERS.sevenLabel, duration: 9, closed: true });
        find('seven');
      }
    }

    // Time only flows for the creatures while the game runs (a paused dish is not "keeping alive").
    const live = paused ? 0 : dt;

    // Viejo amigo: the same creature alive for OLD_FRIEND_S of active play.
    const ids = new Set<number>();
    for (const c of alive) {
      ids.add(c.id);
      const s = (aliveFor.get(c.id) ?? 0) + live;
      aliveFor.set(c.id, s);
      if (s >= OLD_FRIEND_S && save.found.oldFriend === undefined) {
        fx({ kind: 'halo', x: c.x, y: c.y, r: Math.max(12, c.r * 2.2), color: 'gold', duration: 8 });
        find('oldFriend');
      }
    }
    for (const id of [...aliveFor.keys()]) if (!ids.has(id)) aliveFor.delete(id);

    // Silencio: empty dish for SILENCE_S after there has been life.
    if (save.hadLife && alive.length === 0) emptyFor += live;
    else emptyFor = 0;
    if (emptyFor >= SILENCE_S && save.found.silence === undefined) {
      fx({ kind: 'whisper', text: WHISPERS.silence, duration: 6 });
      fx({ kind: 'motes', count: 24, hue: 'silver', duration: 8, from: 'top' });
      find('silence');
    }

    // Capicúa.
    if (save.found.palindrome === undefined) {
      const e = Math.floor(v.essence);
      if (e === EXACT_ESSENCE) find('palindrome', JOURNAL_VARIANTS.exactEssence);
      else if (isPalindromeNumber(e)) find('palindrome', JOURNAL_VARIANTS.palindrome(String(e)));
    }

    // ¿Sigues ahí?
    checkAfk(t);

    // Luna llena (computed at most once a minute).
    if (t - lastMoonCheck >= 60_000) {
      lastMoonCheck = t;
      const m = moonInfo(date);
      if (m.illumination >= FULL_MOON_ILLUMINATION && save.found.fullMoon === undefined) {
        fx({ kind: 'moon', illumination: m.illumination, waxing: m.waxing, duration: 12 });
        find('fullMoon');
      }
    }

    // Cumpleaños.
    if (save.found.birthday === undefined) {
      const b = BIRTHDAYS.find((x) => x.month === date.getMonth() + 1 && x.day === date.getDate());
      if (b) {
        fx({ kind: 'motes', count: 80, hue: 'gold', duration: 7, from: 'bottom' });
        fx({ kind: 'whisper', text: WHISPERS.birthday, duration: 5 });
        find('birthday', b.kind === 'lenia' ? JOURNAL_VARIANTS.birthdayLenia : undefined);
      }
    }

    // Aurora: rare, random, needs a living dish and some play time.
    if (live > 0 && v.stats.playTime >= AURORA_MIN_PLAYTIME_S && stable.length >= AURORA_MIN_STABLE) {
      const mean = save.found.aurora === undefined ? AURORA_MEAN_S : AURORA_REPEAT_MEAN_S;
      if (rng() < live / mean) {
        fx({ kind: 'aurora', duration: AURORA_DURATION_S });
        find('aurora');
      }
    }

    // Cinturón de Orión.
    if (v.stats.playTime >= ORION_MIN_PLAYTIME_S && stable.length >= 3) {
      const belt = findBelt(stable);
      orionStreak = belt ? orionStreak + 1 : 0;
      if (belt && orionStreak >= ORION_POLLS) {
        orionStreak = 0;
        if (save.found.orion === undefined) {
          lastOrionFx = t;
          fx({ kind: 'constellation', points: belt, label: WHISPERS.orionLabel, duration: 9, closed: false });
          find('orion');
        } else if (t - lastOrionFx >= ORION_REPEAT_S * 1000) {
          lastOrionFx = t;
          fx({ kind: 'constellation', points: belt, label: null, duration: 7, closed: false });
        }
      }
    } else orionStreak = 0;

    if (dirty) persist();
  }

  function checkAfk(t: number): void {
    if (paused && pausedSince !== null && t - pausedSince >= AFK_S * 1000 && save.found.afk === undefined) {
      fx({ kind: 'whisper', text: WHISPERS.afk, duration: 6 });
      find('afk');
    }
  }

  // ───────────── bus ─────────────

  const nowS = () => now().getTime() / 1000;
  const offs: (() => void)[] = [];
  offs.push(
    deps.bus.on('seed', (e) => {
      if (!e.manual) return;
      save.manualSeeds++;
      dirty = true;
      if (save.manualSeeds >= ANSWER_SEEDS && save.found.answer === undefined) {
        fx({ kind: 'motes', count: 42, hue: 'cyan', duration: 5, from: 'center' });
        find('answer');
      }
    }),
    deps.bus.on('creatureExploded', () => {
      const s = nowS();
      explosions.push(s);
      explosions = explosions.filter((x) => s - x <= MAXIMIZER_WINDOW_S);
      if (explosions.length >= MAXIMIZER_EXPLOSIONS && save.found.maximizer === undefined) {
        fx({ kind: 'ripple', x: null, y: null, duration: 3 });
        find('maximizer');
      }
    }),
    deps.bus.on('goldenCollected', () => {
      save.goldenStreak++;
      dirty = true;
      if (save.goldenStreak >= GOLDEN_STREAK && save.found.goldenStreak === undefined) {
        fx({ kind: 'motes', count: 90, hue: 'gold', duration: 7, from: 'top' });
        find('goldenStreak');
      }
      persist();
    }),
    deps.bus.on('goldenMissed', () => {
      save.goldenStreak = 0;
      persist();
    }),
    // Sterilising the sterile: an Extinction (classic loop) or the end of a lab session (sessions loop)
    // with nothing alive on the dish.
    deps.bus.on('extinctionStart', () => checkSterile()),
    deps.bus.on('sessionEnd', () => checkSterile()),
    deps.bus.on('speciesNew', () => {
      try {
        checkSpecies(deps.getView());
      } catch {
        /* the next poll will see it */
      }
    }),
  );

  // ───────────── input hooks ─────────────

  function pushSwipe(dir: string, t: number): void {
    swipes.push({ dir, t });
    swipes = swipes.filter((s) => t - s.t <= KONAMI_SWIPE_WINDOW_MS).slice(-KONAMI_SWIPES.length);
    if (swipes.length === KONAMI_SWIPES.length && swipes.every((s, i) => s.dir === KONAMI_SWIPES[i])) {
      swipes = [];
      konami();
    }
  }

  function konami(): void {
    fx({ kind: 'motes', count: 90, hue: 'green', duration: 6, from: 'top' });
    fx({ kind: 'whisper', text: WHISPERS.konami, duration: 4 });
    find('konami');
  }

  function strokeEffect(points: readonly TimedPt[], color: MoteHue, duration = 2.6): void {
    const pts = resample(points, 72).map((p) => ({ x: p.x, y: p.y }));
    fx({ kind: 'trace', points: pts, color, duration });
  }

  /** A living creature inside the drawn loop. */
  function enclosedCreature(loop: readonly TimedPt[]): CreatureView | null {
    let v: GameView;
    try {
      v = deps.getView();
    } catch {
      return null;
    }
    const poly = resample(loop, 48);
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    let best: CreatureView | null = null;
    let bestD = Infinity;
    for (const c of living(v)) {
      if (!pointInPolygon(c.x, c.y, poly)) continue;
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  const api: Secrets = {
    total: TOTAL_SECRETS,
    on: (type, fn) => emitter.on(type, fn),
    tick,

    onKey(k: string) {
      if (typeof k !== 'string' || !k) return;
      keyBuf.push(k.toLowerCase());
      if (keyBuf.length > KONAMI_KEYS.length) keyBuf = keyBuf.slice(-KONAMI_KEYS.length);
      if (keyBuf.length === KONAMI_KEYS.length && keyBuf.every((x, i) => x === KONAMI_KEYS[i])) {
        keyBuf = [];
        konami();
      }
    },

    onLogoTap() {
      const t = now().getTime();
      const last = logoTaps[logoTaps.length - 1];
      if (last !== undefined && t - last > LOGO_GAP_MS) logoTaps = [];
      logoTaps.push(t);
      if (logoTaps.length >= LOGO_TAPS) {
        logoTaps = [];
        fx({ kind: 'logoWake', duration: 4 });
        fx({ kind: 'ripple', x: null, y: null, duration: 2.5 });
        find('logo');
      }
    },

    onEssenceLongPress(ms: number) {
      if (!(ms >= LONG_PRESS_MS)) return;
      let e = 0;
      try {
        e = deps.getView().essence;
      } catch {
        /* keep 0 */
      }
      fx({ kind: 'whisper', text: exactEssenceText(e), duration: 5 });
      find('patience');
    },

    onBrushPath(raw: TimedPt[]) {
      if (!Array.isArray(raw) || raw.length < 2) return;
      const pts = raw.map((p) => ({ ...p }));
      const dir = swipeDirection(pts, 10);
      if (dir) {
        pushSwipe(dir, pts[pts.length - 1].t ?? now().getTime());
        return;
      }
      const m = recognize(pts, { minSize: GESTURE_MIN_CELLS });
      if (!m) return;
      switch (m.name) {
        case 'circle': {
          const c = enclosedCreature(pts);
          if (c) {
            strokeEffect(pts, 'gold');
            fx({ kind: 'halo', x: c.x, y: c.y, r: Math.max(12, c.r * 2.2), color: 'gold', duration: 6 });
            find('halo');
          } else {
            // A circle around nothing: a faint echo, as a hint that circles matter.
            strokeEffect(pts, 'cyan', 1.4);
          }
          break;
        }
        case 'spiral':
          strokeEffect(pts, 'violet');
          fx({ kind: 'motes', count: 50, hue: 'violet', duration: 5, from: 'swirl' });
          find('spiral');
          break;
        case 'heart':
          strokeEffect(pts, 'pink', 3);
          fx({ kind: 'pulse', color: 'pink', beats: 3, duration: 3.2 });
          find('heart');
          break;
        case 'infinity':
          strokeEffect(pts, 'cyan', 3);
          fx({ kind: 'ripple', x: m.cx, y: m.cy, duration: 3 });
          find('infinity');
          break;
        case 'glider':
          strokeEffect(pts, 'green');
          fx({ kind: 'glider', x: m.cx, y: m.cy, duration: 9 });
          find('conway');
          break;
      }
    },

    onSpeciesRenamed(name: string) {
      if (typeof name !== 'string') return;
      const n = normalizeName(name);
      if (!n) return;
      const words = n.split(' ');
      const hit = (list: readonly string[]) => list.includes(n) || words.some((w) => list.includes(w) && w.length >= 4);
      if (hit(CHAN_NAMES)) {
        fx({ kind: 'motes', count: 60, hue: 'gold', duration: 6, from: 'bottom' });
        fx({ kind: 'whisper', text: WHISPERS.chanCredit, duration: 6 });
        find('chan');
        return;
      }
      if (hit(CONWAY_NAMES)) {
        fx({ kind: 'glider', x: center.x, y: center.y, duration: 9 });
        find('conway');
        return;
      }
      const q = RENAME_QUIPS.find((x) => x.names.includes(n));
      if (q) fx({ kind: 'whisper', text: q.text, duration: 4 });
    },

    onDeviceShake() {
      fx({ kind: 'ripple', x: null, y: null, duration: 2.5 });
      if (save.found.shake === undefined) fx({ kind: 'whisper', text: WHISPERS.shake, duration: 4 });
      find('shake');
    },

    setPaused(p: boolean) {
      const t = now().getTime();
      if (p && !paused) pausedSince = t;
      if (!p && paused) checkAfk(t);
      if (!p) pausedSince = null;
      paused = p;
    },

    onBasementOpened() {
      if (count() >= BASEMENT_UNLOCK) find('basement');
    },

    list: () => SECRET_DEFS.map(view),
    get: (id) => view(secretDef(id)),
    isFound: (id) => save.found[id] !== undefined,
    foundCount: count,
    bonusMultiplier: () => 1 + bonus(),
    bonus,
    basementUnlocked: () => count() >= BASEMENT_UNLOCK,
    cosmetics: () => [...save.cosmetics],
    colormap: () => save.colormap,

    setColormap(id) {
      if (id !== null && !save.cosmetics.includes(id)) return false;
      save.colormap = id;
      persist();
      emitter.emit('colormap', { id, colormap: id ? COLORMAPS[id] : null });
      return true;
    },

    revealHint(id) {
      if (save.found[id] === undefined) {
        save.hints[id] = Math.min(2, (save.hints[id] ?? 0) + 1);
        persist();
      }
      return view(secretDef(id));
    },

    rumor() {
      const open = SECRET_DEFS.filter((d) => save.found[d.id] === undefined && (d.id !== 'basement' || count() >= BASEMENT_UNLOCK));
      if (!open.length) return null;
      const d = open[Math.floor(rng() * open.length) % open.length];
      return { id: d.id, text: d.hints[0] };
    },

    serialize: () => JSON.parse(JSON.stringify(save)) as SecretsSave,

    load(data: unknown) {
      const s = sanitize(data);
      if (!s) return;
      const before = count();
      save = merge(save, s);
      repairCosmetics();
      persist();
      if (count() !== before) emitProgress();
    },

    reset() {
      save = emptySave();
      aliveFor.clear();
      emptyFor = 0;
      explosions = [];
      keyBuf = [];
      swipes = [];
      logoTaps = [];
      orionStreak = 0;
      try {
        storage?.removeItem?.(key);
      } catch {
        /* ignore */
      }
      persist();
      emitProgress();
    },

    forceFind(id) {
      find(id);
    },

    dispose() {
      for (const off of offs) off();
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };

  readStorage();
  let timer: ReturnType<typeof setInterval> | null = null;
  if ((deps.autoPoll ?? true) && typeof setInterval === 'function') timer = setInterval(tick, POLL_MS);
  return api;
}

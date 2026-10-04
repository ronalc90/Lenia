/**
 * Client integrity heuristics for the ranking. They only RAISE FLAGS that travel with each submission
 * (the server greys out flagged entries); none of them is proof, and all of them can be bypassed by
 * someone who edits this file. Their job is to catch the cheap, common tricks:
 *  - speed hacks: tools that accelerate performance.now()/requestAnimationFrame (or Date.now()) make the
 *    two clocks diverge; we compare them over ~30 s windows while the page is awake. (A hack that speeds
 *    up both is invisible here, but the server catches play time growing faster than real time.)
 *  - clock rollback: the offline-progress trick "move the clock forward, collect, move it back". We keep a
 *    high-water mark of Date.now() and compare it (and the save's savedAt, see save.ts) with the clock.
 *  - save tampering: a stored save or an imported export whose checksum does not match its data was
 *    edited by hand (the game itself refuses to load it), and an import whose numbers are implausible
 *    under the same rules the server applies (server/validate.ts) was most likely edited and re-summed.
 *  - the debug handle: `window.bioluma` exposes the live game object. Wrap it with guardDebugHandle() and
 *    any read of it marks this browser profile.
 * Flags are sticky (persisted locally, and sticky server-side once sent).
 */
import * as B from '../game/balance';
import type { StorageLike } from '../game/save';
import { base64ToUtf8, checksum, deserializeState, type GameState } from '../game/state';
import type { IntegrityReport } from '../../server/protocol.js';
import { plausibleSnapshot, type RunStats } from '../../server/validate.js';
import { readJson, safeStorage } from './storage';

const K_FLAGS = 'bioluma.lb.integrity';
const K_CLOCK = 'bioluma.lb.clock';
/** The game's own save key (src/game/save.ts K_GAME). */
const K_GAME_SAVE = 'bioluma.game';

/** Judge clocks over windows at least this long. */
const WINDOW_MS = 30_000;
/** A window whose samples are further apart than this had a sleep/background pause: not judged. */
const MAX_GAP_MS = 20_000;
/** Divergence that counts as a strike: ratio beyond ±25 % plus 2 s of slack. */
const RATIO = 1.25;
const SLACK_MS = 2_000;
/** Strikes needed before speedHack is raised. */
const STRIKES = 3;
/** Backwards clock jump that counts as a rollback. */
const ROLLBACK_MS = 10 * 60_000;

export interface Integrity {
  report(): IntegrityReport;
  /** Reasons behind the flags (debugging / support). */
  reasons(): string[];
  /** Take one clock sample (start() does this on a timer). */
  sample(): void;
  start(): void;
  stop(): void;
  /**
   * Boot, before the first save is written: the raw stored game string. Without an argument it reads the
   * game's own key ("bioluma.game", see src/game/save.ts) from this monitor's storage.
   */
  checkSave(raw?: string | null): void;
  /** Boot: LoadedSave.savedAt. A save written "in the future" means the clock was moved back. */
  noteSavedAt(savedAt: number): void;
  /** Settings → import: call with the pasted text (before or after Game.importString). */
  noteImport(text: string): void;
  /** Define target[key] as a getter that returns value and flags this profile when read. */
  guardDebugHandle(target: object, key: string, value: unknown): void;
  markTampered(reason: string): void;
}

export interface IntegrityOptions {
  storage?: StorageLike | null;
  perfNow?: () => number;
  dateNow?: () => number;
  sampleMs?: number;
}

interface Flags {
  speedHack: boolean;
  clockRollback: boolean;
  tampered: boolean;
  debug: boolean;
  reasons: string[];
}

export function runStatsOf(s: Readonly<GameState>): RunStats {
  return {
    lifetimeEssence: s.stats.totalEssence,
    eraEssence: s.eraEssence,
    genome: s.genome + s.genomeSpent,
    speciesCount: s.species.length,
    behaviorsCount: s.behaviorsSeen.length,
    era: s.era,
    playTimeSec: s.stats.playTime,
    seeds: s.stats.seeds,
    createdAt: s.createdAt,
    epsPeak: s.stats.epsPeak,
  };
}

/** True when `raw` is a well-formed save envelope whose checksum does not match its data. */
function checksumMismatch(raw: string): boolean {
  try {
    const o = JSON.parse(raw) as { v?: unknown; sum?: unknown; data?: unknown };
    if (typeof o !== 'object' || o === null || typeof o.sum !== 'string' || typeof o.data !== 'object' || o.data === null) return false;
    return checksum(JSON.stringify(o.data)) !== o.sum;
  } catch {
    return false; // truncated / garbage: corruption, not an edit
  }
}

export function createIntegrity(opts: IntegrityOptions = {}): Integrity {
  const store = safeStorage(opts.storage);
  const perfNow = opts.perfNow ?? (() => performance.now());
  const dateNow = opts.dateNow ?? (() => Date.now());
  const sampleMs = opts.sampleMs ?? 5_000;

  const flags: Flags = {
    speedHack: false,
    clockRollback: false,
    tampered: false,
    debug: false,
    reasons: [],
    ...(readJson<Partial<Flags>>(store, K_FLAGS) ?? {}),
  };
  if (!Array.isArray(flags.reasons)) flags.reasons = [];
  let highWater = Number(readJson<number>(store, K_CLOCK)) || 0;
  let anchor: { p: number; d: number } | null = null;
  let lastSample: { p: number; d: number } | null = null;
  let strikes = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function persist(): void {
    store.setItem(K_FLAGS, JSON.stringify(flags));
  }

  function raise(kind: 'speedHack' | 'clockRollback' | 'tampered' | 'debug', reason: string): void {
    const known = flags[kind] && flags.reasons.includes(reason);
    flags[kind] = true;
    if (!flags.reasons.includes(reason)) flags.reasons = [...flags.reasons, reason].slice(-16);
    if (!known) persist(); // the debug getter fires on every read: write only the first time
  }

  function sample(): void {
    try {
      const p = perfNow();
      const d = dateNow();
      if (!Number.isFinite(p) || !Number.isFinite(d)) return;
      // Clock rollback against the high-water mark.
      if (highWater && d < highWater - ROLLBACK_MS) raise('clockRollback', 'clock_back');
      if (d > highWater) {
        // Persist the mark only when it moved noticeably (fewer writes).
        if (d - highWater > 60_000 || !highWater) store.setItem(K_CLOCK, JSON.stringify(d));
        highWater = d;
      }
      // Speed hack: compare clock progress inside unpaused windows.
      if (lastSample && (p - lastSample.p > MAX_GAP_MS || d - lastSample.d > MAX_GAP_MS || d < lastSample.d)) anchor = null;
      lastSample = { p, d };
      if (!anchor) {
        anchor = { p, d };
        return;
      }
      const dp = p - anchor.p;
      const dd = d - anchor.d;
      if (Math.max(dp, dd) < WINDOW_MS) return;
      if (dp > dd * RATIO + SLACK_MS || dd > dp * RATIO + SLACK_MS) strikes++;
      else strikes = Math.max(0, strikes - 1);
      if (strikes >= STRIKES) raise('speedHack', dp > dd ? 'perf_fast' : 'date_fast');
      anchor = { p, d };
    } catch {
      /* never break the game */
    }
  }

  return {
    report: () => ({ speedHack: flags.speedHack, clockRollback: flags.clockRollback, tampered: flags.tampered, debug: flags.debug }),
    reasons: () => [...flags.reasons],
    sample,
    start() {
      if (timer) return;
      sample();
      timer = setInterval(sample, sampleMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      anchor = null;
      lastSample = null;
    },
    checkSave(raw = store.getItem(K_GAME_SAVE)) {
      if (raw && checksumMismatch(raw)) raise('tampered', 'save_checksum');
    },
    noteSavedAt(savedAt) {
      if (Number.isFinite(savedAt) && savedAt > dateNow() + ROLLBACK_MS) raise('clockRollback', 'saved_in_future');
    },
    noteImport(text) {
      try {
        const t = String(text ?? '').trim();
        if (!t.startsWith(B.EXPORT_PREFIX)) return;
        let json: string;
        try {
          json = base64ToUtf8(t.slice(B.EXPORT_PREFIX.length));
        } catch {
          return; // not a save at all
        }
        if (checksumMismatch(json)) {
          raise('tampered', 'import_checksum');
          return;
        }
        const state = deserializeState(json);
        if (state && plausibleSnapshot(runStatsOf(state), dateNow()).verdict !== 'accept') raise('tampered', 'import_implausible');
      } catch {
        /* ignore */
      }
    },
    guardDebugHandle(target, key, value) {
      try {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: false,
          get() {
            raise('debug', 'debug_handle');
            return value;
          },
        });
      } catch {
        /* frozen target: leave it alone */
      }
    },
    markTampered(reason) {
      raise('tampered', String(reason).slice(0, 32));
    },
  };
}

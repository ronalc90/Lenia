/**
 * Ranking client: identity, signed submissions, top-board fetches. Never throws into the game and works
 * offline (every call resolves with an error value instead).
 *
 * Identity (local storage, created on first use):
 *   bioluma.lb.id    random player id (crypto.randomUUID)
 *   bioluma.lb.key   ECDSA P-256 key pair (private key as JWK). The public key is registered by the
 *                    server on the first accepted submission; later ones must be signed with it.
 *   bioluma.lb.name  chosen display name (the ranking is opt-in: nothing is sent before a name exists)
 * Losing local storage means a new identity (a new entry in the ranking); there is no account system.
 *
 * Wiring (integrator): see docs/RANKING.md. In short:
 *   const integrity = createIntegrity(); integrity.start();
 *   const leaderboard = createLeaderboardClient({ game, integrity });
 *   leaderboard.startAutoSubmit();  // every ~5 min while visible + after each extinction
 *   createUI(root, { …, leaderboard });
 */
import { bus as defaultBus, type Bus, type GameEvents } from '../core/bus';
import type { Lang, Text } from '../core/types';
import type { Game } from '../game/game';
import type { StorageLike } from '../game/save';
import type { LeaderboardBoard, LeaderboardClient, LeaderboardEntry, LeaderboardResult } from '../ui/leaderboard-types';
import { validateName } from '../../server/names.js';
import {
  LB_PROTOCOL_VERSION,
  POW_BITS,
  SUBMIT_MIN_INTERVAL_MS,
  finalizeSubmission,
  generateKeyPair,
  importPrivateKey,
  randomHex,
  SIGN_PREFIX,
  signBytes,
  utf8,
  type IntegrityReport,
  type KeyPairJson,
} from '../../server/protocol.js';
import { LIMITS } from '../../server/validate.js';
import type { Integrity } from './integrity';
import { runStatsOf } from './integrity';
import { readJson, safeStorage } from './storage';

export type { LeaderboardBoard, LeaderboardClient, LeaderboardEntry, LeaderboardResult };

const K_ID = 'bioluma.lb.id';
const K_KEY = 'bioluma.lb.key';
const K_NAME = 'bioluma.lb.name';
const K_REG = 'bioluma.lb.registered';
const K_FIRST = 'bioluma.lb.firstSeen';
const K_LAST = 'bioluma.lb.last';
const K_CREATED = 'bioluma.lb.createdFallback';

/** Last accepted submission, used for the "me" row until the server's boards catch up (write-behind). */
interface LastAccepted {
  name: string;
  flagged: boolean;
  ranks: Partial<Record<LeaderboardBoard, number>>;
  essence: number;
  species: number;
  era: number;
}

/** Player-facing texts for the error codes this client returns from setName / submitNow. */
export const LEADERBOARD_ERRORS: Record<string, Text> = {
  no_name: { es: 'Elige primero un nombre para el ranking', en: 'Pick a ranking name first' },
  name_length: { es: 'El nombre debe tener de 3 a 16 caracteres', en: 'Names must be 3 to 16 characters long' },
  name_chars: { es: 'Solo letras, números, espacios, _ y -', en: 'Only letters, digits, spaces, _ and -' },
  name_profanity: { es: 'Ese nombre no está permitido', en: 'That name is not allowed' },
  name_reserved: { es: 'Ese nombre está reservado', en: 'That name is reserved' },
  offline: { es: 'Sin conexión (offline)', en: 'No connection (offline)' },
  rate_limited: { es: 'Demasiado pronto: prueba en un minuto', en: 'Too soon: try again in a minute' },
  implausible: { es: 'El sistema anti-trampas rechazó la puntuación', en: 'The anti-cheat checks rejected this score' },
  identity: { es: 'Identidad de ranking no válida', en: 'Invalid ranking identity' },
  unsupported: { es: 'Este navegador no puede firmar envíos (hace falta HTTPS)', en: 'This browser cannot sign submissions (HTTPS required)' },
  server: { es: 'El ranking no está disponible ahora mismo', en: 'The ranking is unavailable right now' },
};

export function leaderboardErrorText(code: string, lang: Lang): string {
  return (LEADERBOARD_ERRORS[code] ?? LEADERBOARD_ERRORS.server)[lang];
}

export interface LeaderboardClientOptions {
  game: Game;
  /** API origin; '' (default) = same origin as the page. */
  baseUrl?: string;
  storage?: StorageLike;
  integrity?: Pick<Integrity, 'report'>;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  bus?: Bus<GameEvents>;
  now?: () => number;
  powBits?: number;
  /** Auto-submit period (default 5 min, ±10 % jitter). */
  autoSubmitMs?: number;
  timeoutMs?: number;
}

/**
 * The ranking key pair as a general "player identity" for other signed APIs (src/store uses it for
 * entitlements; same shape as src/store/providers/types.ts PlayerIdentity). Domain separation: it never
 * signs a message that could be mistaken for a ranking submission.
 */
export interface LeaderboardIdentity {
  playerId(): Promise<string>;
  /** base64url raw P-256 public key (server/protocol.ts format). */
  publicKey(): Promise<string>;
  /** base64url IEEE-P1363 ECDSA signature of the UTF-8 bytes of `message`. */
  sign(message: string): Promise<string>;
}

export interface BiolumaLeaderboardClient extends LeaderboardClient {
  /** Submit every ~5 min while the page is visible, and shortly after every extinction. */
  startAutoSubmit(): void;
  stop(): void;
  readonly playerId: string;
  /** Same player id + key for other signed APIs (store entitlements). */
  readonly identity: LeaderboardIdentity;
}

type SubmitResult = { ok: boolean; error?: string };
/** Internal result: `code` is a key of LEADERBOARD_ERRORS. */
type CodeResult = { ok: true } | { ok: false; code: string };

function uuid(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function num(x: unknown, fallback = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

/** Defensive mapping of one row from the network. */
function toEntry(x: unknown): LeaderboardEntry | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.name !== 'string') return null;
  const e: LeaderboardEntry = {
    rank: Math.max(1, Math.floor(num(o.rank, 1))),
    name: o.name.slice(0, 40),
    score: num(o.score),
    species: num(o.species),
    era: num(o.era, 1),
    isMe: o.isMe === true,
  };
  if (o.flagged === true) e.flagged = true;
  return e;
}

export function createLeaderboardClient(opts: LeaderboardClientOptions): BiolumaLeaderboardClient {
  const game = opts.game;
  const store = safeStorage(opts.storage);
  const base = (opts.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = opts.fetch ?? ((i: string, init?: RequestInit) => fetch(i, init));
  const bus = opts.bus ?? defaultBus;
  const now = opts.now ?? (() => Date.now());
  const powBits = opts.powBits ?? POW_BITS;
  const period = opts.autoSubmitMs ?? 5 * 60_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  let playerId = store.getItem(K_ID) ?? '';
  if (!/^[0-9a-fA-F-]{16,64}$/.test(playerId)) {
    playerId = uuid();
    store.setItem(K_ID, playerId);
  }
  if (!store.getItem(K_FIRST)) store.setItem(K_FIRST, String(now()));

  let keyPromise: Promise<{ pub: string; priv: CryptoKey }> | null = null;
  let inflight: Promise<CodeResult> | null = null;
  let lastSubmitAt = -Infinity;
  let lastClientTime = 0;
  let lastPlayTime = -1;
  /** serverTime − now(), learned from every response. */
  let offset = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let offBus: (() => void) | null = null;

  const lang = (): Lang => {
    try {
      return game.state.settings?.lang === 'en' ? 'en' : 'es';
    } catch {
      return 'es';
    }
  };
  const err = (code: string): SubmitResult => ({ ok: false, error: leaderboardErrorText(code, lang()) });
  const fail = (code: string): CodeResult => ({ ok: false, code });
  const toPublic = (r: CodeResult): SubmitResult => (r.ok ? { ok: true } : err(r.code));

  function keys(): Promise<{ pub: string; priv: CryptoKey }> {
    if (!keyPromise) {
      keyPromise = (async () => {
        const saved = readJson<KeyPairJson>(store, K_KEY);
        if (saved?.pub && saved.priv) {
          try {
            return { pub: saved.pub, priv: await importPrivateKey(saved.priv) };
          } catch {
            /* corrupted: make a new one (new identity on the server) */
          }
        }
        const kp = await generateKeyPair();
        store.setItem(K_KEY, JSON.stringify(kp));
        return { pub: kp.pub, priv: await importPrivateKey(kp.priv) };
      })();
      keyPromise.catch(() => (keyPromise = null));
    }
    return keyPromise;
  }

  async function request(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> } | null> {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await doFetch(`${base}${path}`, { ...init, signal: ctrl?.signal, cache: 'no-store', credentials: 'same-origin' });
      let body: Record<string, unknown> = {};
      try {
        const parsed: unknown = await res.json();
        if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
      } catch {
        /* non-JSON (e.g. a 404 page when the API is not deployed) */
      }
      if (typeof body.serverTime === 'number' && Number.isFinite(body.serverTime)) offset = body.serverTime - now();
      return { status: res.status, body };
    } catch {
      return null; // offline, DNS, CORS, timeout…
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function createdAt(): number {
    const s = game.state;
    if (s.createdAt >= LIMITS.GAME_EPOCH_MS) return s.createdAt;
    // Saves without a usable createdAt (pre-release dev saves): the earliest time we know of, never
    // before the game's epoch, fixed once so the server keeps comparing against the same run.
    const stored = Number(store.getItem(K_CREATED));
    if (stored >= LIMITS.GAME_EPOCH_MS) return stored;
    const first = Number(store.getItem(K_FIRST)) || now();
    const fallback = Math.max(LIMITS.GAME_EPOCH_MS, Math.min(first, now() - s.stats.playTime * 1000));
    store.setItem(K_CREATED, String(fallback));
    return fallback;
  }

  async function submitOnce(): Promise<CodeResult> {
    const name = store.getItem(K_NAME);
    if (!name) return fail('no_name');
    if (!globalThis.crypto?.subtle) return fail('unsupported');
    let attempt = 0;
    for (;;) {
      let key: { pub: string; priv: CryptoKey };
      try {
        key = await keys();
      } catch {
        return fail('unsupported');
      }
      let body: string;
      let clientTime: number;
      try {
        const { pub, priv } = key;
        const stats = runStatsOf(game.state);
        const integrity: IntegrityReport = opts.integrity?.report() ?? { speedHack: false, clockRollback: false, tampered: false };
        // Strictly after the last ACCEPTED submission (server anti-replay rule).
        clientTime = Math.max(Math.round(now() + offset), lastClientTime + 1);
        const sub = await finalizeSubmission(
          {
            version: LB_PROTOCOL_VERSION,
            playerId,
            publicKey: pub,
            name,
            ...stats,
            createdAt: createdAt(),
            clientTime,
            nonce: randomHex(16),
            integrity,
          },
          priv,
          powBits,
        );
        body = JSON.stringify(sub);
      } catch {
        return fail('server');
      }
      const res = await request('/api/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      if (!res) return fail('offline');
      lastSubmitAt = now();
      const code = typeof res.body.error === 'string' ? res.body.error : '';
      if (res.status === 200 && res.body.ok === true) {
        lastClientTime = clientTime;
        store.setItem(K_REG, '1');
        const ranks = (typeof res.body.ranks === 'object' && res.body.ranks ? res.body.ranks : {}) as LastAccepted['ranks'];
        const s = game.state;
        const last: LastAccepted = {
          name: typeof res.body.name === 'string' ? res.body.name.slice(0, 40) : name,
          flagged: res.body.flagged === true,
          ranks,
          essence: s.stats.totalEssence,
          species: s.species.length,
          era: s.era,
        };
        store.setItem(K_LAST, JSON.stringify(last));
        lastPlayTime = game.state.stats.playTime;
        return { ok: true };
      }
      // The offset was just refreshed from serverTime: one immediate retry fixes a skewed clock.
      if ((code === 'clock' || code === 'replay') && attempt++ === 0) continue;
      if (code.startsWith('name_') && code in LEADERBOARD_ERRORS) return fail(code);
      if (res.status === 429) return fail('rate_limited');
      if (code === 'implausible') return fail('implausible');
      if (code === 'key_mismatch' || code === 'bad_signature') return fail('identity');
      return fail(res.status === 404 ? 'offline' : 'server');
    }
  }

  function submitCore(): Promise<CodeResult> {
    if (inflight) return inflight;
    inflight = submitOnce()
      .catch(() => fail('server'))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  const submitNow = async (): Promise<SubmitResult> => toPublic(await submitCore());

  /**
   * The boards are persisted in batches (server/blob.ts), so right after registering the server may not
   * know us yet: show our own row from the last accepted submission instead of nothing.
   */
  function provisionalMe(board: LeaderboardBoard, entries: LeaderboardEntry[]): LeaderboardEntry | null {
    const last = readJson<LastAccepted>(store, K_LAST);
    if (!last || !store.getItem(K_REG)) return null;
    const score = board === 'essence' ? last.essence : board === 'species' ? last.species : last.era;
    const rank = Math.max(1, Math.floor(num(last.ranks[board], 0)) || entries.filter((e) => e.score > score).length + 1);
    const e: LeaderboardEntry = { rank, name: last.name, score, species: last.species, era: last.era, isMe: true };
    if (last.flagged) e.flagged = true;
    return e;
  }

  async function fetchTop(board: LeaderboardBoard): Promise<LeaderboardResult> {
    try {
      const q = new URLSearchParams({ board });
      if (store.getItem(K_REG)) q.set('player', playerId);
      const res = await request(`/api/leaderboard?${q.toString()}`);
      if (!res) return { error: 'offline' };
      if (res.status === 429) return { error: 'rate_limited' };
      if (res.status !== 200 || res.body.ok !== true || !Array.isArray(res.body.entries)) {
        return { error: res.status === 404 ? 'offline (no API)' : `server error ${res.status}` };
      }
      const entries = res.body.entries.map(toEntry).filter((e): e is LeaderboardEntry => e !== null);
      let me = res.body.me ? toEntry(res.body.me) : null;
      if (me) me.isMe = true;
      else me = provisionalMe(board, entries);
      return { entries, me };
    } catch {
      return { error: 'offline' };
    }
  }

  async function setName(raw: string): Promise<SubmitResult> {
    try {
      const v = validateName(raw);
      if (!v.ok) return err(v.error);
      const previous = store.getItem(K_NAME);
      store.setItem(K_NAME, v.name);
      // Too soon after the last submission: the name goes out with the next one.
      if (now() - lastSubmitAt < SUBMIT_MIN_INTERVAL_MS) return { ok: true };
      const r = await submitCore();
      if (!r.ok && r.code.startsWith('name_')) {
        // The server refused the name (client/server rules out of sync): keep the old one.
        if (previous) store.setItem(K_NAME, previous);
        else store.removeItem(K_NAME);
        return toPublic(r);
      }
      return { ok: true }; // saved locally; offline / rate limits are retried by auto-submit
    } catch {
      return err('server');
    }
  }

  /** Auto-submit only when there is something new and the server would accept the timing. */
  function autoTick(): void {
    try {
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (hidden || !store.getItem(K_NAME)) return;
      if (inflight) {
        // A slow submission is still running (it carries older numbers): try again once it is done.
        void inflight.finally(() => schedule(SUBMIT_MIN_INTERVAL_MS + 2_000));
        return;
      }
      if (now() - lastSubmitAt < SUBMIT_MIN_INTERVAL_MS + 2_000) return;
      if (game.state.stats.playTime === lastPlayTime) return;
      void submitCore();
    } catch {
      /* never break the game */
    }
  }

  function schedule(delayMs: number): void {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      autoTick();
    }, delayMs);
  }

  const identity: LeaderboardIdentity = {
    playerId: async () => playerId,
    publicKey: async () => (await keys()).pub,
    async sign(message: string) {
      if (message.startsWith(SIGN_PREFIX)) throw new Error('identity: ranking messages are signed by the ranking client only');
      return signBytes((await keys()).priv, utf8(message));
    },
  };

  return {
    identity,
    get playerId() {
      return playerId;
    },
    getName: () => store.getItem(K_NAME),
    setName,
    fetchTop,
    submitNow,
    startAutoSubmit() {
      if (interval) return;
      const jitter = period * (0.9 + Math.random() * 0.2);
      interval = setInterval(autoTick, jitter);
      schedule(30_000);
      offBus = bus.on('extinctionDone', () => {
        const wait = Math.max(5_000, lastSubmitAt + SUBMIT_MIN_INTERVAL_MS + 2_000 - now());
        schedule(wait);
      });
    },
    stop() {
      if (interval) clearInterval(interval);
      if (pendingTimer) clearTimeout(pendingTimer);
      interval = null;
      pendingTimer = null;
      offBus?.();
      offBus = null;
    },
  };
}

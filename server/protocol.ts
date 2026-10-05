/**
 * Ranking wire protocol shared by the browser client (src/net/) and the serverless API (api/).
 * Pure, dependency-free, Web Crypto only (`globalThis.crypto.subtle`: browsers, Node >= 19,
 * Vercel Edge/Node runtimes).
 *
 * A submission is a flat JSON object. The client:
 *   1. fills every field except `powSolution` and `sig`,
 *   2. finds `powSolution` (hashcash): SHA-256("bioluma-pow-v1|" + digest(payload) + "|" + n) must start
 *      with POW_BITS zero bits, where digest = SHA-256 hex of the canonical JSON of the payload without
 *      `powSolution`/`sig`. The work is bound to this exact payload, so it cannot be reused.
 *   3. signs "bioluma-lb-v1\n" + canonical JSON of everything but `sig` with its ECDSA P-256 key.
 * The server registers the public key on a player's first accepted submission (trust on first use)
 * and from then on only accepts submissions for that player id signed by that key.
 *
 * Honesty note: this proves "the same browser profile sent it" and makes scripted spam cost CPU.
 * It does not prove the numbers are real: the key lives in the player's own browser. Plausibility
 * checks (server/validate.ts) are what reject or flag impossible scores.
 */

export const LB_PROTOCOL_VERSION = 1;
/** Leading zero bits of the proof of work (~16k SHA-256 on average, a fraction of a second). */
export const POW_BITS = 14;
export const BOARD_NAMES = ['essence', 'species', 'era'] as const;
export type BoardName = (typeof BOARD_NAMES)[number];

/** Request bodies above this many bytes are refused (a real submission is ~700 bytes). */
export const MAX_BODY_BYTES = 4096;
/** Minimum time between two submissions of the same player (server enforced). */
export const SUBMIT_MIN_INTERVAL_MS = 60_000;
/** `clientTime` must be within this of the server clock (client corrects with `serverTime`). */
export const MAX_CLOCK_SKEW_MS = 10 * 60_000;
/** Entries kept per stored board / returned by GET. */
export const BOARD_STORED = 200;
export const BOARD_SERVED = 50;

/** Client-side integrity heuristics (src/net/integrity.ts). Any `true` flags the entry server-side. */
export interface IntegrityReport {
  speedHack: boolean;
  clockRollback: boolean;
  tampered: boolean;
  /** The debug handle (window.bioluma) was read in this browser profile. */
  debug?: boolean;
}

/** Everything that is signed. Numbers come straight from the game state. */
export interface SubmissionPayload {
  version: number;
  playerId: string;
  /** base64url of the raw (65-byte, uncompressed) P-256 public key. */
  publicKey: string;
  name: string;
  /** stats.totalEssence: essence ever earned (never decreases). */
  lifetimeEssence: number;
  eraEssence: number;
  /** Genome ever earned: unspent + spent. */
  genome: number;
  speciesCount: number;
  behaviorsCount: number;
  era: number;
  playTimeSec: number;
  seeds: number;
  /** stats.epsPeak: highest essence/s ever (buffs included). */
  epsPeak: number;
  /** First-run time of the save (ms). */
  createdAt: number;
  /**
   * Optional (added for RF-01, ADR-026): 'sessions' for a sessions-cycle save, which then also sends
   * `sessions` (finished) and `datos` (ever earned). Absent = an old client of the classic Era loop.
   */
  cycle?: 'sessions';
  sessions?: number;
  datos?: number;
  /** Client estimate of the SERVER clock in ms (Date.now() + offset learned from serverTime). */
  clientTime: number;
  /** 32 hex chars, random per submission. */
  nonce: string;
  integrity: IntegrityReport;
  powSolution: number;
  /**
   * Optional ranking cosmetics the player wants shown (catalog ids: badge, frame, nameColor). Only
   * sent when something other than the defaults is equipped; the server shows only what the
   * player's store record allows (server/cosmetics.ts).
   */
  cosmetics?: { badge?: string; frame?: string; nameColor?: string };
}

export interface Submission extends SubmissionPayload {
  /** base64url of the 64-byte IEEE-P1363 ECDSA signature. */
  sig: string;
}

/** Domain prefix of ranking signatures (other signed APIs must not sign messages starting with it). */
export const SIGN_PREFIX = 'bioluma-lb-v1\n';
const POW_PREFIX = 'bioluma-pow-v1|';

// ───────────────────────────── encoding ─────────────────────────────

const enc = new TextEncoder();

export function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null on malformed input instead of throwing. */
export function b64urlDecode(s: string): Uint8Array | null {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

export function randomHex(nBytes: number): string {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return toHex(b);
}

/**
 * Deterministic JSON: object keys sorted, no whitespace, `undefined` members dropped.
 * Both ends run JavaScript, so number formatting (JSON.stringify) is identical.
 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported ${typeof v}`);
}

// ───────────────────────────── hashing ──────────────────────────────

// TS 5.9 types digest/sign/verify inputs as BufferSource over ArrayBuffer; TextEncoder output is fine
// at runtime, the cast only satisfies the typed-array generics.
type Bytes = Uint8Array<ArrayBuffer>;
const ab = (u: Uint8Array): Bytes => u as Bytes;

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', ab(bytes)));
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return toHex(await sha256(data));
}

/** Storage key of a player: raw ids are never persisted server-side. */
export async function playerKey(playerId: string): Promise<string> {
  return (await sha256Hex(`bioluma-player|${playerId}`)).slice(0, 32);
}

/** "#1234"-style discriminator shown after the name; derived from the key, so stable per player. */
export function tagFromKey(key: string): string {
  return String(parseInt(key.slice(0, 8), 16) % 10000).padStart(4, '0');
}

export function leadingZeroBits(h: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < h.length; i++) {
    const b = h[i];
    if (b === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

// ───────────────────────────── payload helpers ──────────────────────

function withoutKeys<T extends object>(o: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!keys.includes(k)) out[k] = v;
  return out;
}

/** Hex digest the proof of work is bound to (payload without powSolution / sig). */
export async function powChallenge(p: SubmissionPayload | Submission): Promise<string> {
  return sha256Hex(canonicalJson(withoutKeys(p, ['powSolution', 'sig'])));
}

/** Bytes the ECDSA signature covers (everything except sig). */
export function signedBytes(p: SubmissionPayload | Submission): Uint8Array {
  return utf8(SIGN_PREFIX + canonicalJson(withoutKeys(p, ['sig'])));
}

export async function powValid(challenge: string, solution: number, bits = POW_BITS): Promise<boolean> {
  if (!Number.isSafeInteger(solution) || solution < 0) return false;
  return leadingZeroBits(await sha256(`${POW_PREFIX}${challenge}|${solution}`)) >= bits;
}

/**
 * Hashcash search. Digests are issued in parallel batches: crypto.subtle is async, and awaiting one
 * hash at a time is dominated by promise overhead. Never blocks the main thread for long.
 */
export async function solvePow(challenge: string, bits = POW_BITS, opts: { batch?: number; maxTries?: number } = {}): Promise<number> {
  const batch = opts.batch ?? 128;
  const maxTries = opts.maxTries ?? 1 << 26;
  for (let base = 0; base < maxTries; base += batch) {
    const hashes = await Promise.all(
      Array.from({ length: batch }, (_, i) => sha256(`${POW_PREFIX}${challenge}|${base + i}`)),
    );
    for (let i = 0; i < batch; i++) if (leadingZeroBits(hashes[i]) >= bits) return base + i;
  }
  throw new Error('pow: no solution found');
}

// ───────────────────────────── ECDSA P-256 ──────────────────────────

const EC = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIG_ALG = { name: 'ECDSA', hash: 'SHA-256' } as const;

export interface KeyPairJson {
  /** base64url raw public key. */
  pub: string;
  /** Private key as JWK (kept in the player's local storage). */
  priv: JsonWebKey;
}

export async function generateKeyPair(): Promise<KeyPairJson> {
  const kp = (await crypto.subtle.generateKey(EC, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { pub: b64urlEncode(raw), priv };
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, EC, false, ['sign']);
}

/** A raw uncompressed P-256 point is 65 bytes starting with 0x04 (87 base64url chars). */
export function publicKeyBytes(pub: string): Uint8Array | null {
  const b = b64urlDecode(pub);
  return b && b.length === 65 && b[0] === 4 ? b : null;
}

export async function signBytes(priv: CryptoKey, data: Uint8Array): Promise<string> {
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign(SIG_ALG, priv, ab(data))));
}

/** Never throws: malformed keys / signatures just fail verification. */
export async function verifyBytes(pub: string, sig: string, data: Uint8Array): Promise<boolean> {
  try {
    const raw = publicKeyBytes(pub);
    const s = b64urlDecode(sig);
    if (!raw || !s || s.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', ab(raw), EC, false, ['verify']);
    return await crypto.subtle.verify(SIG_ALG, key, ab(s), ab(data));
  } catch {
    return false;
  }
}

/** Client: complete a payload (minus pow/sig) into a signed submission. */
export async function finalizeSubmission(
  payload: Omit<SubmissionPayload, 'powSolution'>,
  priv: CryptoKey,
  bits = POW_BITS,
): Promise<Submission> {
  const challenge = await powChallenge({ ...payload, powSolution: 0 });
  const powSolution = await solvePow(challenge, bits);
  const full: SubmissionPayload = { ...payload, powSolution };
  const sig = await signBytes(priv, signedBytes(full));
  return { ...full, sig };
}

// ───────────────────────────── parsing (server) ─────────────────────

const UUIDISH = /^[0-9a-fA-F-]{16,64}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const NUM_FIELDS = [
  'lifetimeEssence',
  'eraEssence',
  'genome',
  'speciesCount',
  'behaviorsCount',
  'era',
  'playTimeSec',
  'seeds',
  'epsPeak',
  'createdAt',
  'clientTime',
  'powSolution',
] as const;
const INT_FIELDS = new Set(['speciesCount', 'behaviorsCount', 'era', 'seeds', 'powSolution']);
const ALL_KEYS = new Set<string>([
  'version',
  'playerId',
  'publicKey',
  'name',
  'nonce',
  'integrity',
  'sig',
  'cosmetics',
  'cycle',
  'sessions',
  'datos',
  ...NUM_FIELDS,
]);

export type ParseResult = { ok: true; sub: Submission } | { ok: false; error: string };

/** Strict structural validation of an untrusted body (types, formats, ranges; no plausibility). */
export function parseSubmission(x: unknown): ParseResult {
  const bad = (error: string): ParseResult => ({ ok: false, error });
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return bad('body');
  const o = x as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!ALL_KEYS.has(k)) return bad(`unknown_field:${k.slice(0, 24)}`);
  if (o.version !== LB_PROTOCOL_VERSION) return bad('version');
  if (typeof o.playerId !== 'string' || !UUIDISH.test(o.playerId)) return bad('playerId');
  if (typeof o.publicKey !== 'string' || !publicKeyBytes(o.publicKey)) return bad('publicKey');
  if (typeof o.name !== 'string' || o.name.length > 64) return bad('name');
  if (typeof o.nonce !== 'string' || !HEX32.test(o.nonce)) return bad('nonce');
  if (typeof o.sig !== 'string' || o.sig.length > 100) return bad('sig');
  for (const k of NUM_FIELDS) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return bad(k);
    if (INT_FIELDS.has(k) && !Number.isSafeInteger(v)) return bad(k);
  }
  if (o.cycle !== undefined || o.sessions !== undefined || o.datos !== undefined) {
    if (o.cycle !== 'sessions') return bad('cycle');
    for (const k of ['sessions', 'datos'] as const) {
      const v = o[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return bad(k);
    }
    if (!Number.isSafeInteger(o.sessions)) return bad('sessions');
  }
  const i = o.integrity;
  if (typeof i !== 'object' || i === null || Array.isArray(i)) return bad('integrity');
  const ir = i as Record<string, unknown>;
  for (const k of Object.keys(ir)) if (!['speedHack', 'clockRollback', 'tampered', 'debug'].includes(k)) return bad('integrity');
  if (typeof ir.speedHack !== 'boolean' || typeof ir.clockRollback !== 'boolean' || typeof ir.tampered !== 'boolean') {
    return bad('integrity');
  }
  if (ir.debug !== undefined && typeof ir.debug !== 'boolean') return bad('integrity');
  if (o.cosmetics !== undefined) {
    const c = o.cosmetics;
    if (typeof c !== 'object' || c === null || Array.isArray(c)) return bad('cosmetics');
    for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
      if (!['badge', 'frame', 'nameColor'].includes(k) || typeof v !== 'string' || !/^[a-z0-9.]{3,48}$/.test(v)) return bad('cosmetics');
    }
  }
  return { ok: true, sub: o as unknown as Submission };
}

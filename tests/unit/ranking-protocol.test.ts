import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  canonicalJson,
  finalizeSubmission,
  generateKeyPair,
  importPrivateKey,
  leadingZeroBits,
  parseSubmission,
  playerKey,
  powChallenge,
  powValid,
  signedBytes,
  solvePow,
  tagFromKey,
  verifyBytes,
  type Submission,
  type SubmissionPayload,
} from '../../server/protocol';

const BITS = 6;

function payload(pub: string, over: Partial<SubmissionPayload> = {}): Omit<SubmissionPayload, 'powSolution'> {
  return {
    version: 1,
    playerId: '0f8e2a4c-1b3d-4e5f-8a9b-0c1d2e3f4a5b',
    publicKey: pub,
    name: 'Ana',
    lifetimeEssence: 12345.678,
    eraEssence: 12345.678,
    genome: 0,
    speciesCount: 3,
    behaviorsCount: 2,
    era: 1,
    playTimeSec: 900.5,
    seeds: 40,
    epsPeak: 12.5,
    createdAt: Date.UTC(2026, 9, 1),
    clientTime: Date.UTC(2026, 9, 1, 1),
    nonce: 'a'.repeat(32),
    integrity: { speedHack: false, clockRollback: false, tampered: false },
    ...over,
  };
}

describe('encoding helpers', () => {
  it('canonical JSON sorts keys recursively and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":0}]},"b":1}');
    expect(canonicalJson({ x: 1e21, y: -0.5, s: 'ñ"' })).toBe(JSON.stringify({ s: 'ñ"', x: 1e21, y: -0.5 }));
  });

  it('base64url round-trips arbitrary bytes and rejects garbage', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 255);
    const s = b64urlEncode(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect([...b64urlDecode(s)!]).toEqual([...bytes]);
    expect(b64urlDecode('not base64!')).toBeNull();
  });

  it('counts leading zero bits', () => {
    expect(leadingZeroBits(Uint8Array.from([0, 0, 0x10, 0xff]))).toBe(19);
    expect(leadingZeroBits(Uint8Array.from([0x80]))).toBe(0);
    expect(leadingZeroBits(Uint8Array.from([0, 0]))).toBe(16);
  });

  it('derives a stable, non-reversible player key and a 4-digit tag', async () => {
    const k = await playerKey('player-1-uuid-0000');
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(await playerKey('player-1-uuid-0000')).toBe(k);
    expect(await playerKey('player-2-uuid-0000')).not.toBe(k);
    expect(tagFromKey(k)).toMatch(/^\d{4}$/);
  });
});

describe('ECDSA signatures', () => {
  it('a signed submission verifies with its public key and fails with any other', async () => {
    const kp = await generateKeyPair();
    const other = await generateKeyPair();
    const sub = await finalizeSubmission(payload(kp.pub), await importPrivateKey(kp.priv), BITS);
    expect(sub.sig).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await verifyBytes(kp.pub, sub.sig, signedBytes(sub))).toBe(true);
    expect(await verifyBytes(other.pub, sub.sig, signedBytes(sub))).toBe(false);
  });

  it('changing any signed field (or the key order on the wire) is detected / irrelevant respectively', async () => {
    const kp = await generateKeyPair();
    const sub = await finalizeSubmission(payload(kp.pub), await importPrivateKey(kp.priv), BITS);
    const forged: Submission = { ...sub, lifetimeEssence: sub.lifetimeEssence * 1000 };
    expect(await verifyBytes(kp.pub, forged.sig, signedBytes(forged))).toBe(false);
    const flipped: Submission = { ...sub, integrity: { ...sub.integrity, tampered: false, speedHack: false } };
    expect(await verifyBytes(kp.pub, sub.sig, signedBytes(flipped))).toBe(true);
    // Same object, keys in another order (as JSON.parse on the server may produce): still valid.
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(sub).reverse()))) as Submission;
    expect(await verifyBytes(kp.pub, reordered.sig, signedBytes(reordered))).toBe(true);
  });

  it('malformed keys and signatures fail closed instead of throwing', async () => {
    const kp = await generateKeyPair();
    const data = new TextEncoder().encode('x');
    expect(await verifyBytes('AAAA', 'AAAA', data)).toBe(false);
    expect(await verifyBytes(kp.pub, 'A'.repeat(86), data)).toBe(false);
    expect(await verifyBytes(kp.pub.slice(0, -2) + 'zz', 'A'.repeat(86), data)).toBe(false);
  });
});

describe('proof of work', () => {
  it('solves and verifies, and the solution is bound to the payload', async () => {
    const kp = await generateKeyPair();
    const sub = await finalizeSubmission(payload(kp.pub), await importPrivateKey(kp.priv), 10);
    const ch = await powChallenge(sub);
    expect(await powValid(ch, sub.powSolution, 10)).toBe(true);
    // A different payload (other nonce) needs its own work: the old solution is (almost surely) invalid.
    let reused = 0;
    for (let i = 0; i < 8; i++) {
      const other = await powChallenge({ ...sub, nonce: String(i).repeat(32).slice(0, 32) });
      if (await powValid(other, sub.powSolution, 10)) reused++;
    }
    expect(reused).toBeLessThan(2);
  });

  it('rejects negative / fractional solutions and higher difficulty than solved', async () => {
    const n = await solvePow('abc', 8);
    expect(await powValid('abc', n, 8)).toBe(true);
    expect(await powValid('abc', -1, 0)).toBe(false);
    expect(await powValid('abc', 1.5, 0)).toBe(false);
    // At 8 bits the chance the same n also meets 20 bits is 2^-12.
    expect(await powValid('abc', n, 20)).toBe(false);
  });

  it('the default difficulty is solvable in well under a few seconds', async () => {
    const t0 = performance.now();
    await solvePow('timing-check', 14);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});

describe('parseSubmission', () => {
  async function valid(): Promise<Record<string, unknown>> {
    const kp = await generateKeyPair();
    return { ...(await finalizeSubmission(payload(kp.pub), await importPrivateKey(kp.priv), 2)) };
  }

  it('accepts a well-formed body', async () => {
    expect(parseSubmission(await valid()).ok).toBe(true);
  });

  it.each([
    ['unknown field', (o: Record<string, unknown>) => (o.extra = 1)],
    ['negative number', (o: Record<string, unknown>) => (o.lifetimeEssence = -1)],
    ['NaN', (o: Record<string, unknown>) => (o.eraEssence = Number.NaN)],
    ['string number', (o: Record<string, unknown>) => (o.era = '2')],
    ['fractional count', (o: Record<string, unknown>) => (o.speciesCount = 2.5)],
    ['bad nonce', (o: Record<string, unknown>) => (o.nonce = 'xyz')],
    ['bad public key', (o: Record<string, unknown>) => (o.publicKey = 'abc')],
    ['bad player id', (o: Record<string, unknown>) => (o.playerId = '../../etc')],
    ['wrong version', (o: Record<string, unknown>) => (o.version = 99)],
    ['integrity not boolean', (o: Record<string, unknown>) => (o.integrity = { speedHack: 'no', clockRollback: false, tampered: false })],
    ['integrity extra key', (o: Record<string, unknown>) => (o.integrity = { speedHack: false, clockRollback: false, tampered: false, x: true })],
    ['huge name', (o: Record<string, unknown>) => (o.name = 'x'.repeat(100))],
    ['an unknown cycle', (o: Record<string, unknown>) => Object.assign(o, { cycle: 'era', sessions: 3, datos: 10 })],
    ['sessions without the cycle', (o: Record<string, unknown>) => Object.assign(o, { sessions: 3, datos: 10 })],
    ['negative Datos', (o: Record<string, unknown>) => Object.assign(o, { cycle: 'sessions', sessions: 3, datos: -1 })],
    ['fractional sessions', (o: Record<string, unknown>) => Object.assign(o, { cycle: 'sessions', sessions: 2.5, datos: 10 })],
  ])('rejects %s', async (_label, mutate) => {
    const o = await valid();
    mutate(o);
    expect(parseSubmission(o).ok).toBe(false);
  });

  it('accepts the sessions-cycle fields (RF-01)', async () => {
    const o = { ...(await valid()), cycle: 'sessions', sessions: 12, datos: 340 };
    expect(parseSubmission(o).ok).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const x of [null, 1, 'x', [], undefined]) expect(parseSubmission(x).ok).toBe(false);
  });
});

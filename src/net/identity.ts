/**
 * The player's pseudonymous identity: a random player id and an ECDSA P-256 key pair, both in local
 * storage. The ranking client signs submissions with it; other signed APIs (store entitlements) use it
 * through `PlayerIdentity` without ever being able to sign a ranking-shaped message.
 *
 *   bioluma.lb.id    random player id (crypto.randomUUID)
 *   bioluma.lb.key   key pair (private key as JWK); the server registers the public key on first use
 *
 * `createPlayerIdentity()` works without the ranking (e.g. builds without VITE_LEADERBOARD_URL), so
 * the wardrobe and the store keep one stable identity either way. Only one instance should exist per
 * page: when a leaderboard client exists, use its `identity`.
 */
import type { StorageLike } from '../game/save';
import { generateKeyPair, importPrivateKey, randomHex, SIGN_PREFIX, signBytes, utf8, type KeyPairJson } from '../../server/protocol.js';
import { readJson, safeStorage } from './storage';

export const K_ID = 'bioluma.lb.id';
export const K_KEY = 'bioluma.lb.key';

/** Same shape as src/store/providers/types.ts PlayerIdentity. */
export interface PlayerIdentity {
  playerId(): Promise<string>;
  /** base64url raw P-256 public key (server/protocol.ts format). */
  publicKey(): Promise<string>;
  /** base64url IEEE-P1363 ECDSA signature of the UTF-8 bytes of `message`. */
  sign(message: string): Promise<string>;
}

export interface KeyMaterial {
  pub: string;
  priv: CryptoKey;
}

function uuid(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The stored player id, created (and saved) on first use. */
export function ensurePlayerId(store: StorageLike): string {
  let id = store.getItem(K_ID) ?? '';
  if (!/^[0-9a-fA-F-]{16,64}$/.test(id)) {
    id = uuid();
    store.setItem(K_ID, id);
  }
  return id;
}

/** Lazily loads (or creates) the key pair once; a failed attempt can be retried. */
export function createKeyLoader(store: StorageLike): () => Promise<KeyMaterial> {
  let keyPromise: Promise<KeyMaterial> | null = null;
  return () => {
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
  };
}

/** Identity over a player id and a key loader. Refuses to sign ranking messages (domain separation). */
export function identityFrom(playerId: () => string, keys: () => Promise<KeyMaterial>): PlayerIdentity {
  return {
    playerId: async () => playerId(),
    publicKey: async () => (await keys()).pub,
    async sign(message: string) {
      if (message.startsWith(SIGN_PREFIX)) throw new Error('identity: ranking messages are signed by the ranking client only');
      return signBytes((await keys()).priv, utf8(message));
    },
  };
}

/** Standalone identity from the same storage the ranking uses. */
export function createPlayerIdentity(storage?: StorageLike): PlayerIdentity {
  const store = safeStorage(storage);
  const id = ensurePlayerId(store);
  return identityFrom(() => id, createKeyLoader(store));
}

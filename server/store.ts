/**
 * Ranking storage. The API code talks to `LeaderboardStore`; two implementations:
 *  - MemoryStore: tests, local dev, and the fallback when no Blob credentials are configured
 *    (works per serverless instance only: each warm instance has its own little leaderboard).
 *  - BlobStore (server/blob.ts): Vercel Blob REST, write-behind (see that file for why).
 *
 * Records are keyed by `playerKey(playerId)` (a hash): raw player ids are never stored. Nothing here is
 * secret: a player record holds a PUBLIC key (ECDSA P-256), so even a leaked store lets nobody sign
 * submissions for someone else.
 */
import type { RankCosmetics } from './cosmetics.js';
import { BOARD_NAMES, BOARD_STORED, type BoardName } from './protocol.js';
import type { Baseline } from './validate.js';

export interface PlayerRecord {
  key: string;
  /** base64url raw P-256 public key registered on the first accepted submission (trust on first use). */
  pub: string;
  name: string;
  tag: string;
  /** Server ms of the first accepted submission (registration order breaks key conflicts). */
  registeredAt: number;
  /** Last accepted submission; the reference for the next plausibility check. */
  last: Baseline;
  /** Best values ever accepted (the boards rank these, so a game reset does not wipe your rank). */
  best: { essence: number; species: number; era: number };
  flagged: boolean;
  /** Sticky reason codes (validate.ts soft reasons). */
  flags: string[];
  accepted: number;
  /** Server ms of the last change (merge key across serverless instances). */
  updatedAt: number;
  /** Ranking cosmetics resolved at the last submission (non-default only; server/cosmetics.ts). */
  cosmetics?: RankCosmetics;
}

export interface BoardEntry {
  key: string;
  name: string;
  tag: string;
  /** Value ranked by this board. */
  score: number;
  essence: number;
  species: number;
  era: number;
  /** Server ms when this score was reached (earlier wins ties). */
  at: number;
  /** Ranking cosmetics of the player (badge, frame, name colour), when not the defaults. */
  cosmetics?: RankCosmetics;
}

export interface LeaderboardStore {
  readonly kind: 'memory' | 'blob';
  getPlayer(id: string): Promise<PlayerRecord | null>;
  putPlayer(rec: PlayerRecord): Promise<void>;
  /** Sorted best-first, at most BOARD_STORED entries, never flagged players. */
  getBoard(name: BoardName): Promise<BoardEntry[]>;
  putBoard(name: BoardName, entries: BoardEntry[]): Promise<void>;
  /** Write-behind stores persist buffered writes here when due (no-op otherwise). */
  flush?(force?: boolean): Promise<void>;
}

// ───────────────────────────── board helpers ───────────────────────

export function scoreOf(board: BoardName, b: PlayerRecord['best']): number {
  return board === 'essence' ? b.essence : board === 'species' ? b.species : b.era;
}

export function entryFor(board: BoardName, rec: PlayerRecord): BoardEntry {
  return {
    key: rec.key,
    name: rec.name,
    tag: rec.tag,
    score: scoreOf(board, rec.best),
    essence: rec.best.essence,
    species: rec.best.species,
    era: rec.best.era,
    at: rec.last.at,
    ...(rec.cosmetics ? { cosmetics: rec.cosmetics } : {}),
  };
}

/** Best first; ties: more essence, then whoever got there first, then key (total order). */
export function compareEntries(a: BoardEntry, b: BoardEntry): number {
  return b.score - a.score || b.essence - a.essence || a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/** Insert / replace / remove (rec flagged) one player's entry, keep it sorted and trimmed. */
export function upsertEntry(board: BoardName, entries: readonly BoardEntry[], rec: PlayerRecord): BoardEntry[] {
  const out = entries.filter((e) => e.key !== rec.key);
  if (!rec.flagged) out.push(entryFor(board, rec));
  out.sort(compareEntries);
  return out.slice(0, BOARD_STORED);
}

/** Boards rebuilt from scratch out of every known player (used by BlobStore on flush). */
export function deriveBoards(players: Iterable<PlayerRecord>): Record<BoardName, BoardEntry[]> {
  const ok = [...players].filter((p) => !p.flagged);
  const out = {} as Record<BoardName, BoardEntry[]>;
  for (const b of BOARD_NAMES) out[b] = ok.map((p) => entryFor(b, p)).sort(compareEntries).slice(0, BOARD_STORED);
  return out;
}

/** 1-based rank of `rec` on a stored board; 0 = not on it (flagged or below the stored top). */
export function rankOn(entries: readonly BoardEntry[], key: string): number {
  const i = entries.findIndex((e) => e.key === key);
  return i < 0 ? 0 : i + 1;
}

// ───────────────────────────── memory store ────────────────────────

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export class MemoryStore implements LeaderboardStore {
  readonly kind = 'memory' as const;
  private players = new Map<string, PlayerRecord>();
  private boards = new Map<BoardName, BoardEntry[]>();

  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const p = this.players.get(id);
    return p ? clone(p) : null;
  }
  async putPlayer(rec: PlayerRecord): Promise<void> {
    this.players.set(rec.key, clone(rec));
  }
  async getBoard(name: BoardName): Promise<BoardEntry[]> {
    return clone(this.boards.get(name) ?? []);
  }
  async putBoard(name: BoardName, entries: BoardEntry[]): Promise<void> {
    this.boards.set(name, clone(entries).slice(0, BOARD_STORED));
  }
  async flush(): Promise<void> {
    /* nothing buffered */
  }
  /** Tests / debugging. */
  get size(): number {
    return this.players.size;
  }
}

/**
 * Leaderboard client contract (implemented by the backend module, passed to the
 * UI as the optional `UIDeps.leaderboard`). The integrator may re-export these
 * from core later.
 */
export type LeaderboardBoard = 'essence' | 'species' | 'era';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  species: number;
  era: number;
  isMe: boolean;
  flagged?: boolean;
}

export type LeaderboardResult = { entries: LeaderboardEntry[]; me: LeaderboardEntry | null } | { error: string };

export interface LeaderboardClient {
  getName(): string | null;
  setName(name: string): Promise<{ ok: boolean; error?: string }>;
  fetchTop(board: LeaderboardBoard): Promise<LeaderboardResult>;
  submitNow(): Promise<{ ok: boolean; error?: string }>;
}

/** Client-side nickname check (3–16 chars: letters, digits, space, _ or -). */
export function validateNickname(raw: string): 'ok' | 'short' | 'long' | 'invalid' {
  const s = raw.trim();
  if (s.length < 3) return 'short';
  if (s.length > 16) return 'long';
  if (!/^[\p{L}\p{N} _\-.]+$/u.test(s)) return 'invalid';
  return 'ok';
}

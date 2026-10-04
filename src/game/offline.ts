/** Offline progress (doc §12). Pure functions. */
import * as B from './balance';

/** Mean production over the stored active-play history (last OFFLINE_WINDOW seconds). */
export function averageEps(history: readonly number[], bucketSum = 0, bucketTime = 0): number {
  // Full buckets of the last window plus the open (partial) bucket.
  const n = Math.floor(B.OFFLINE_WINDOW / B.EPS_BUCKET);
  const recent = history.slice(-n);
  const sum = recent.reduce((a, v) => a + v * B.EPS_BUCKET, 0) + bucketSum;
  const time = recent.length * B.EPS_BUCKET + bucketTime;
  return time > 0 ? sum / time : 0;
}

/**
 * Essence granted for `seconds` away: avg · OFFLINE_RATE · min(seconds, cap).
 * Negative / NaN time (clock went backwards) gives 0.
 */
export function offlineEssence(avgEps: number, seconds: number, capSeconds: number): number {
  if (!(seconds > 0) || !(avgEps > 0)) return 0;
  const t = Math.min(seconds, capSeconds, B.OFFLINE_HARD_CAP);
  return avgEps * B.OFFLINE_RATE * t;
}

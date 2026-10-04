/** Offline progress (doc §12). Pure functions. */
import * as B from './balance';

/**
 * Mean production over exactly the last OFFLINE_WINDOW seconds of active play: the open (partial)
 * bucket first, then full buckets newest first, the oldest one trimmed to fit. Before, a full
 * history plus the open bucket covered more than the window, so a few fresh seconds at 0 (just
 * loaded) dragged the average (QA1: 2 h at 10/s gave 35 510 instead of ~36 000).
 */
export function averageEps(history: readonly number[], bucketSum = 0, bucketTime = 0): number {
  const W = B.OFFLINE_WINDOW;
  const part = Math.min(Math.max(0, bucketTime), W);
  let time = part;
  let sum = bucketTime > 0 ? (bucketSum / bucketTime) * part : 0;
  for (let i = history.length - 1; i >= 0 && time < W; i--) {
    const take = Math.min(B.EPS_BUCKET, W - time);
    sum += history[i] * take;
    time += take;
  }
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

import { SIM_STEPS_PER_SEC } from './cycleBalance';

/**
 * Seconds of game time a frame is worth (QA4 F-02, ADR-027). While the dish runs, game time is DISH
 * time: the steps it really ran ÷ the steps per second at the current pace. A slow phone (or a frame
 * that waited for its detector snapshot, or dropped steps over the per-frame cap) gets a slower clock,
 * so a 15 s run is always 15 s of dish life. With the dish frozen (speed 0: the end card's stamp) the
 * game keeps wall time unless something pauses it.
 */
export function dishSeconds(f: { stepped: number; speed: number; wallDt: number; paused: boolean }): number {
  if (f.speed > 0) return f.stepped / (SIM_STEPS_PER_SEC * f.speed);
  return f.paused ? 0 : f.wallDt;
}

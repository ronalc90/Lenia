/**
 * The interruption budget of a lab session (ADR-030, docs/CLARIDAD2.md §2.8), as a pure rule.
 *
 * While a run's clock is on, a Momento may stop the dish only when it is an accident seen for the first
 * time (two creatures merged, the dish overflowed), at most RUN_CARD_MAX times per run and never in the
 * first RUN_QUIET_START_S seconds. Every other Momento is a brief label on the dish, and its full card
 * goes to the report as a plate (moments.drainForSummary). Before the clock starts and after it ends
 * nothing opens on the dish: the cards of the session flow own the screen, and what is still queued is
 * handed to the report, never carried into the next run. The first Spark is VELA's (story t_golden).
 * The classic loop has no runs: its Momentos keep their cards (null verdict).
 */
import { RUN_CARD_MAX, RUN_QUIET_START_S } from './config';
import type { MomentId } from './types';

/** First-time accidents: the only Momentos that may pause a running session (§2.5, §2.8). */
export const ACCIDENT_MOMENTS: readonly MomentId[] = ['explode', 'overgrown'];

/** Momentos a running session leaves to VELA's dialogue (the one bubble allowed with the clock on, §2.8). */
export const STORY_TOLD_IN_RUN: readonly MomentId[] = ['golden'];

/**
 * - card   a paused card (counts against the run's budget)
 * - brief  a label, explained (its card is a plate in the report)
 * - later  a label that keeps the moment unexplained: an accident whose card did not fit this run
 * - hold   wait in the queue (no clock running): the report takes it, or it is dropped with the run
 * - story  never a Momento in this run: VELA tells it
 */
export type RunVerdict = 'card' | 'brief' | 'later' | 'hold' | 'story';

/** What the rule looks at (from the GameView and the Momentos' own count). */
export interface RunFacts {
  cycle: 'classic' | 'sessions' | undefined;
  phase: 'ready' | 'running' | 'over' | null;
  /** Seconds of this run's clock already run. */
  elapsed: number;
  /** Pausing cards already opened in this run. */
  cards: number;
}

export function isAccident(id: MomentId): boolean {
  return ACCIDENT_MOMENTS.includes(id);
}

/** The run's verdict for a Momento about to open, or null outside the sessions loop (no budget). */
export function runVerdict(id: MomentId, f: RunFacts): RunVerdict | null {
  if (f.cycle !== 'sessions' || f.phase === null) return null;
  if (f.phase !== 'running') return 'hold';
  if (STORY_TOLD_IN_RUN.includes(id)) return 'story';
  if (!isAccident(id)) return 'brief';
  return f.cards < RUN_CARD_MAX && f.elapsed >= RUN_QUIET_START_S ? 'card' : 'later';
}

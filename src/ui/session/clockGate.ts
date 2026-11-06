/**
 * When the session clock waits for the player (ADR-030, docs/CLARIDAD2.md §2.3, §2.4), as pure rules the
 * session flow and main.ts share.
 *
 *  - Session 1: the player's first tap plants the sure creature and does not start the clock (the game's
 *    `tutorialHold`); the clock starts when VELA's «Tu reloj empieza ahora» goes (story.holdsClock), or at
 *    once when the story is off or the tutorial was skipped, and never later than the failsafe.
 *  - The clock stops while VELA talks in a running session ('story') and while a sheet covers the dish
 *    ('sheet': the Bestiary, the Bitácora, Settings, «?», a price or behaviour sheet). A session never
 *    ends behind a sheet: a paused clock cannot reach 0.
 *  - The start card's «¡Empezar!» waits for the run's culture to be lit, never longer than START_WAKE_MAX_S,
 *    with the seconds left on the button (QA-CLARIDAD-2 B1: it hung for minutes on a slow device).
 */
import { START_WAKE_MAX_S } from '../../game/cycleBalance';

/**
 * Wall milliseconds the session-1 clock may wait for the tutorial at most (a story stuck behind something
 * never holds a session forever; while VELA talks, the 'story' pause still holds the clock).
 */
export const TUTORIAL_CLOCK_FAILSAFE_MS = 30_000;
/**
 * The failsafe above counts only while the dish is lit (QA-3 N4: on a phone at 4–5 fps the first creature
 * incubated in the dark for ~30 s and the clock started before VELA could say «Tócala»). A dish that never lights
 * still lets the clock go after this much wall time.
 */
export const TUTORIAL_CLOCK_HARD_MS = 4 * TUTORIAL_CLOCK_FAILSAFE_MS;

/** The slice of the session view the rules read. */
export interface ClockSession {
  phase: 'ready' | 'running' | 'over';
  tutorialHold?: boolean;
}

/**
 * Start the held session-1 clock now? `heldForMs`: time it has waited for the tutorial with the dish lit (VELA can
 * talk); `heldTotalMs`: all the wall time it waited (TUTORIAL_CLOCK_HARD_MS).
 */
export function shouldStartClock(s: ClockSession | null | undefined, tutorialHolds: boolean, heldForMs: number, heldTotalMs = heldForMs): boolean {
  if (!s || s.phase !== 'ready' || !s.tutorialHold) return false;
  return !tutorialHolds || heldForMs > TUTORIAL_CLOCK_FAILSAFE_MS || heldTotalMs > TUTORIAL_CLOCK_HARD_MS;
}

/** The session-1 hold's two clocks (lit time and all of it), fed by the session flow every frame. */
export class TutorialHold {
  private since = -1;
  private last = 0;
  private lit = 0;

  /** One frame at wall time `now` (ms): `lit` = the dish shows its creatures. True: start the clock now. */
  step(s: ClockSession | null | undefined, now: number, lit: boolean, tutorialHolds: boolean): boolean {
    if (!s || s.phase !== 'ready' || !s.tutorialHold) {
      this.since = -1;
      return false;
    }
    if (this.since < 0) {
      this.since = now;
      this.last = now;
      this.lit = 0;
    }
    if (lit) this.lit += now - this.last;
    this.last = now;
    return shouldStartClock(s, tutorialHolds, this.lit, now - this.since);
  }
}

/** The two pause sources of the clarity pass: VELA talking over a running clock, and any open sheet. */
export function clockPauses(f: { talking: boolean; phase: ClockSession['phase'] | null | undefined; sheet: boolean }): { story: boolean; sheet: boolean } {
  return { story: f.talking && f.phase === 'running', sheet: f.sheet };
}

/**
 * «¡Empezar!» on the start card: enabled once the culture is lit, or after START_WAKE_MAX_S at most (the culture
 * may light a little later; the run waits for it). `waitedMs`: wall time the card has waited so far.
 */
export function startGo(cultureReady: boolean, waitedMs: number): { ready: boolean; secondsLeft: number } {
  const left = START_WAKE_MAX_S - Math.max(0, waitedMs) / 1000;
  if (cultureReady || left <= 0) return { ready: true, secondsLeft: 0 };
  return { ready: false, secondsLeft: Math.ceil(left) };
}

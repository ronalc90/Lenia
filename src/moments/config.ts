/**
 * Presentation timings of the Momentos system. These are pacing choices of the
 * explainer layer (not game balance), so they live here and not in
 * src/game/balance.ts. All values in milliseconds unless stated.
 */

/** Quiet gap after a paused card closes before the next one may open (the player breathes). */
export const COOLDOWN_MS = 3500;
/** Gap after a brief label before the next moment. */
export const COOLDOWN_BRIEF_MS = 1200;
/** A ready moment waits this long for a more important one that is about to be ready (same instant events). */
export const PRIORITY_GRACE_MS = 1000;
/** How long a brief label stays pinned to the event. */
export const BRIEF_MS = 3200;
/** A queued moment that could not open for this long is dropped (not marked seen: it can come back). */
export const MAX_QUEUE_MS = 45_000;
/**
 * Extinction ritual: the overlay whitens the dish for 3 s and fades out in
 * ~1.75 s (src/ui/overlay.ts startRitual). Moments wait it out, plus a margin.
 */
export const RITUAL_BLOCK_MS = 6500;
/** Nothing opens during the first instants after boot (splash, offline card, layout). */
export const BOOT_QUIET_MS = 1200;
/** Default view poll period. */
export const POLL_MS = 250;

/** localStorage key of the persisted state. */
export const MOMENTS_STORAGE_KEY = 'bioluma.moments';

/**
 * Age (simulation steps) at which the detector may call a creature stable:
 * detector default `stableAge` (src/detect/detector.ts), GDD §9 / ADR-009.
 * Used for the "Naciendo" progress ring of the status pills.
 */
export const STABLE_AGE_STEPS = 400;

/** Status pills drawn at most on this many creatures at once (crowded dishes stay readable). */
export const STATUS_MAX = 6;

/** Text limits (owner's "a 5-year-old and a grandparent understand it" rule; enforced by tests). */
export const MAX_TITLE_WORDS = 4;
export const MAX_LINE_WORDS = 14;
export const MAX_LINES = 2;
export const MAX_BRIEF_WORDS = 7;

/**
 * The interruption budget of a lab session (ADR-030, docs/CLARIDAD2.md §2.8; owner: "at most one pausing
 * card per run, only for a first-time accident"). A 15–45 s run cannot take more than one stop: everything
 * else is a brief label on the dish and a plate in the report. Pacing of the explainer layer, like the
 * timings above, so it lives here and not in src/game/balance.ts.
 */
export const RUN_CARD_MAX = 1;
/** No pausing card in the first seconds of a run's clock: the player has just started playing (§2.8). */
export const RUN_QUIET_START_S = 5;

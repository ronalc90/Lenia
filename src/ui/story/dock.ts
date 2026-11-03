/**
 * How VELA's layer looks over the screen under it (owner bug, docs/ARTE-PULIDO.md B-10.2). 'dock' = a
 * screen of its own is up (the Tree and its sheets): her bubble sits above it like a note pinned on top,
 * and nothing of hers dims, covers or spotlights that screen, so the sheet's own button keeps its colour.
 */
export type StoryHold = 'hide' | 'dock' | null;

export interface StoryLook {
  /** Backdrop darkness of the spotlight (0 = none). */
  dim: number;
  /** The soft scrim behind a choice. */
  scrim: boolean;
  /** Ring and arrow around the line's target. */
  spotlight: boolean;
}

export function storyLook(held: StoryHold, task: boolean, choice: boolean): StoryLook {
  if (held === 'dock') return { dim: 0, scrim: false, spotlight: false };
  return { dim: task ? 0.42 : 0.6, scrim: choice, spotlight: true };
}

/**
 * Is any part of the scene on screen, or about to be? `reenter`: the box left this frame to come back on
 * the other side on the next one. It counts as showing, so the story loop runs that next frame and the
 * host's hold (dock) does not drop and flip the box back (integrator review of v0.019: a soft-lock).
 */
export function sceneShowing(s: { box: boolean; reenter: boolean; task: boolean; choice: boolean }): boolean {
  return s.box || s.reenter || s.task || s.choice;
}

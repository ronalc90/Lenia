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

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

/** Story scenes about the research tree: they play in the Tree, docked at the top (QA4 F-01), and nowhere else. */
export const TREE_SCENES: ReadonlySet<string> = new Set(['t_tree', 't_world', 'a1_night']);

/** What covers the dish right now, as the host's hold sees it. */
export interface HoldScreen {
  treeOpen: boolean;
  /** A session card («¡Tiempo!», the report, the start card), a busy flow or the welcome card. */
  cardOpen: boolean;
}

/**
 * One layer at a time (QA4 F-01): in the Tree only the scenes about the Tree, docked at the top; over a card,
 * nothing. A Tree scene never shows over the dish (QA-3 N6: «¡Ese late en verde! … Tócalo.» and «Te lo dejo
 * elegido…» followed the player back to the dish and sat on Sembrar).
 */
export function storyHold(id: string | null, s: HoldScreen): StoryHold {
  const tree = !!id && TREE_SCENES.has(id);
  if (s.treeOpen) return tree ? 'dock' : 'hide';
  if (tree || s.cardOpen) return 'hide';
  return null;
}

/** The Tree just closed with one of its scenes on: it ends there (a choice is put off and comes back in the Tree). */
export function endsWithTree(id: string | null, treeWasOpen: boolean, treeOpen: boolean): boolean {
  return treeWasOpen && !treeOpen && !!id && TREE_SCENES.has(id);
}

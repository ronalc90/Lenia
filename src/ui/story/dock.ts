import { S } from './strings';

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
  /**
   * The scene is a story beat, not a tutorial step (QA-4 N5): from session 2 beats play in the Tree, between runs,
   * docked like the Tree's own lines. Absent = a tutorial step (it belongs to the dish).
   */
  beat?: boolean;
}

/**
 * One layer at a time (QA4 F-01): in the Tree only the scenes about the Tree, docked at the top; over a card,
 * nothing. A Tree scene never shows over the dish (QA-3 N6: «¡Ese late en verde! … Tócalo.» and «Te lo dejo
 * elegido…» followed the player back to the dish and sat on Sembrar).
 */
export function storyHold(id: string | null, s: HoldScreen): StoryHold {
  const tree = !!id && TREE_SCENES.has(id);
  if (s.treeOpen) return tree || (!!id && !!s.beat) ? 'dock' : 'hide';
  if (tree || s.cardOpen) return 'hide';
  return null;
}

/**
 * The Tree just closed with one of its scenes, or a story beat (`beat`, QA-4 N5), on: it ends there (a choice is put
 * off and comes back in the Tree); it never follows the player onto the next run.
 */
export function endsWithTree(id: string | null, treeWasOpen: boolean, treeOpen: boolean, beat = false): boolean {
  return treeWasOpen && !treeOpen && !!id && (TREE_SCENES.has(id) || beat);
}

/** A box on screen (px of the story layer). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Does VELA's box go on top? A small target decides (the box never covers it: low → top, high → bottom). A line
 * with no target, or about the whole dish (`big`), goes on top while the Sembrar button sits low (`sow`): QA-4 N15,
 * «Hola. Soy VELA…» sat over «Sembrar» until the player tapped her. `H` = the layer's height.
 */
export function boxOnTop(target: Box | null, big: boolean, sow: Box | null, H: number): boolean {
  if (target && !big) return target.y + target.h / 2 > H * 0.55;
  return !!sow && sow.w > 0 && sow.y + sow.h / 2 > H * 0.55;
}

/**
 * Does «Saltar» skip the WHOLE tutorial here (two taps) rather than this one scene? On VELA's first line; and on every
 * tutorial box when that line was never watched (v0.028: a player who sowed before it could play lost its button, and
 * story.ts counts it done unwatched). An archive replay only skips itself.
 */
export function skipsTutorial(scene: { id: string; tutorial: boolean; replay: boolean } | null, introWatched: boolean): boolean {
  if (!scene || scene.replay || !scene.tutorial) return false;
  return scene.id === 't_intro' || !introWatched;
}

/**
 * The «Saltar» button's label, long and short (QA-4 N15: at 360 px «Saltar tutorial ›» ran into «VELA · MC-7»; a
 * narrow box shows the short one). `tutorial`: it skips the whole tutorial; `sure`: the second tap it asks for.
 */
export function skipLabel(tutorial: boolean, sure: boolean): Record<'es' | 'en', { long: string; short: string }> {
  const long = sure ? S.skipTutorialSure : tutorial ? S.skipTutorial : S.skip;
  const short = sure ? S.skipSureShort : S.skip;
  return { es: { long: long.es, short: short.es }, en: { long: long.en, short: short.en } };
}

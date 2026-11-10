/**
 * What the finger gathers on the dish in one gesture (ADR-031, docs/MECANICAS.md §3.1: one tap, one hit). Code review
 * v0.027 #4: the ripple and the sweep collected drop by drop, and every drop was a hit of the streak and of the
 * Chispazo count. Now a tap on empty agar asks the game once (`collectAt`: every drop in reach, one hit for the tap)
 * and a sweep once per move (`collectPath`: the drops on the path, no hit; the creatures it crosses are its hits).
 *
 * The game decides which drops come; while it answers, `active` is on, so the UI's 'lightCollected' handler draws
 * in each drop the game names (and only those: nothing flies that the wallet did not get).
 */
import type { GameActions } from '../core/types';

/** The two ways the game collects for a gesture. */
type GatherActions = Pick<GameActions, 'collectAt' | 'collectPath'>;

/** Overlay CSS px ↔ grid cells (the dish's Camera). */
interface GatherCamera {
  readonly scale: number;
  screenToGrid(px: number, py: number): { x: number; y: number };
}

export class HandGather {
  /** The game is answering a gesture of the hand right now. */
  active = false;

  constructor(
    private readonly actions: () => GatherActions,
    private readonly cam: GatherCamera,
  ) {}

  /** A tap on empty agar at overlay point (px, py): every drop within `reachPx` comes in, for one hit. */
  ripple(px: number, py: number, reachPx: number): number {
    const a = this.actions();
    if (!a.collectAt) return 0;
    const g = this.cam.screenToGrid(px, py);
    return this.answer(() => a.collectAt!(g.x, g.y, this.cells(reachPx)));
  }

  /** A sweep moved from (x0, y0) to (x1, y1) (overlay px): the drops within `touchPx` of the path come in, no hit. */
  sweep(x0: number, y0: number, x1: number, y1: number, touchPx: number): number {
    const a = this.actions();
    if (!a.collectPath) return 0;
    return this.answer(() => a.collectPath!([this.cam.screenToGrid(x0, y0), this.cam.screenToGrid(x1, y1)], this.cells(touchPx)));
  }

  private cells(px: number): number {
    const s = this.cam.scale;
    return s > 0 && Number.isFinite(s) ? px / s : 0;
  }

  private answer(ask: () => number): number {
    this.active = true;
    try {
      return ask();
    } finally {
      this.active = false;
    }
  }
}

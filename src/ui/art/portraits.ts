/**
 * Drop-in replacement for src/ui/story/portraits.ts (docs/ARTE.md §6, swap-in in §11): the same
 * exports and signatures — PortraitState, setVelaWear/getVelaWear, drawVela, drawAlbor,
 * drawCommittee, drawChoir, drawYou, drawPortrait and the Portrait class — drawn with the new art.
 * The only widening: `mood` also accepts 'sleepy' and 'proud' (a superset of story Mood, so every
 * existing caller still type-checks).
 */
import type { Mood, Speaker } from '../../story/types';
import { LeniaLens } from '../story/lens';
import { drawAlborArt, drawChoirArt, drawCommitteeArt, drawYouArt } from './cast';
import { drawVelaArt, featherEdges, type ArtMood } from './vela';

export type { ArtMood } from './vela';
export { ART_MOODS } from './vela';

export interface PortraitState {
  speaker: Speaker;
  mood: ArtMood | Mood;
  /** Seconds since the mood changed (for a little squash pop). */
  moodAge: number;
  /** 0..1 mouth openness (smoothed by the caller). */
  talk: number;
  /** True while text is typing. */
  talking: boolean;
  /** 0..1, 1 = eyes closed. */
  blink: number;
  live: boolean;
  /** Ages (s) of the Choir's rings. */
  pulses: number[];
  reduceMotion: boolean;
  /** (VELA) accessories to draw; defaults to the global wardrobe (setVelaWear). */
  wear?: readonly string[];
}

/** VELA's wardrobe, unlocked by Encargos ('scarf' | 'medal' | 'flower'). Shared by every VELA portrait. */
let velaWear: readonly string[] = [];
export function setVelaWear(list: readonly string[]): void {
  velaWear = [...list];
}
export function getVelaWear(): readonly string[] {
  return velaWear;
}

export function drawVela(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, opts: { mini?: boolean } = {}): void {
  drawVelaArt(ctx, { ...s, mood: s.mood as ArtMood, wear: s.wear ?? velaWear }, t, opts);
}

export function drawAlbor(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  drawAlborArt(ctx, s, t);
}

export function drawCommittee(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  drawCommitteeArt(ctx, s, t);
}

export function drawChoir(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, lens: LeniaLens | null): void {
  drawChoirArt(ctx, s, t, lens);
}

export function drawYou(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  drawYouArt(ctx, s, t);
}

/** `opts.mini` (VELA only): the simplified avatar for 24–56 px (Portrait picks it automatically). */
export function drawPortrait(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, lens: LeniaLens | null, opts: { mini?: boolean } = {}): void {
  switch (s.speaker) {
    case 'vela':
      return drawVela(ctx, s, t, opts);
    case 'albor':
      return drawAlbor(ctx, s, t);
    case 'committee':
      return drawCommittee(ctx, s, t);
    case 'coro':
      return drawChoir(ctx, s, t, lens);
    case 'you':
      return drawYou(ctx, s, t);
  }
}

/** Below this CSS size VELA is drawn as the simplified avatar (no hands, bubbles or props). */
export const MINI_BELOW = 56;

/** Blink timing per mood: sleepy blinks slowly and often, awed rarely. */
const BLINK: Record<ArtMood, { every: [number, number]; close: number; open: number }> = {
  neutral: { every: [2.6, 5.4], close: 0.07, open: 0.09 },
  happy: { every: [2.6, 5.4], close: 0.07, open: 0.09 },
  worried: { every: [1.4, 3], close: 0.05, open: 0.07 },
  awed: { every: [4.5, 7.5], close: 0.07, open: 0.09 },
  sleepy: { every: [1.6, 3.2], close: 0.22, open: 0.38 },
  proud: { every: [3, 6], close: 0.07, open: 0.09 },
};

/**
 * A portrait canvas with its own blink timer and smoothing. Call `frame()` every animation frame
 * while visible. Same API as the old Portrait.
 */
export class Portrait {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private sizePx = 0;
  private dpr = 1;
  state: PortraitState = {
    speaker: 'vela',
    mood: 'neutral',
    moodAge: 10,
    talk: 0,
    talking: false,
    blink: 0,
    live: false,
    pulses: [],
    reduceMotion: false,
  };
  private nextBlink = 2;
  private blinkT = -1;
  /** Deterministic jitter for blink intervals (no Math.random in art code). */
  private seed = 0x9e3779b9;
  private lens: LeniaLens | null = null;

  constructor(className = 'sty-portrait') {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
  }

  set(speaker: PortraitState['speaker'], mood: ArtMood | Mood, live = false): void {
    if (speaker !== this.state.speaker || mood !== this.state.mood) this.state.moodAge = 0;
    this.state.speaker = speaker;
    this.state.mood = mood;
    this.state.live = live;
    if (speaker === 'coro' && !this.lens) {
      try {
        this.lens = new LeniaLens();
      } catch {
        this.lens = null;
      }
    }
  }

  /** A ring out of the Choir (one per spoken dot). */
  pulse(): void {
    this.state.pulses.push(0);
    if (this.state.pulses.length > 8) this.state.pulses.shift();
  }

  private rand(): number {
    // xorshift32
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  private fit(): void {
    const css = this.canvas.clientWidth || 100;
    const dpr = Math.min(3, (globalThis.devicePixelRatio as number | undefined) ?? 1);
    if (css !== this.sizePx || dpr !== this.dpr) {
      this.sizePx = css;
      this.dpr = dpr;
      this.canvas.width = Math.round(css * dpr);
      this.canvas.height = Math.round(css * dpr);
    }
  }

  frame(t: number, dt: number, talkTarget: number, talking: boolean): void {
    const s = this.state;
    s.moodAge += dt;
    s.talking = talking;
    s.talk += (talkTarget - s.talk) * Math.min(1, dt * 18);
    s.pulses = s.pulses.map((p) => p + dt).filter((p) => p < 1.6);
    const b = BLINK[(s.mood as ArtMood) in BLINK ? (s.mood as ArtMood) : 'neutral'];
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      s.blink = this.blinkT < b.close ? this.blinkT / b.close : Math.max(0, 1 - (this.blinkT - b.close) / b.open);
      if (this.blinkT > b.close + b.open) {
        this.blinkT = -1;
        s.blink = 0;
      }
    } else if (t > this.nextBlink && !s.reduceMotion) {
      this.blinkT = 0;
      this.nextBlink = t + b.every[0] + this.rand() * (b.every[1] - b.every[0]);
    }
    if (s.speaker === 'coro' && this.lens && !s.reduceMotion) this.lens.update(dt);
    this.fit();
    const ctx = this.ctx;
    if (!ctx) return;
    const k = (this.sizePx * this.dpr) / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawPortrait(ctx, s, t, this.lens, { mini: this.sizePx < MINI_BELOW });
    featherEdges(ctx, 4);
  }
}

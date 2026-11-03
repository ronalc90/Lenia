/**
 * Drop-in replacement for src/ui/story/portraits.ts (docs/ARTE.md §6, swap-in in §11): the same
 * exports and signatures — PortraitState, setVelaWear/getVelaWear, drawVela, drawAlbor,
 * drawCommittee, drawChoir, drawYou, drawPortrait and the Portrait class — drawn with the new art.
 * `mood` takes every story Mood (VELA draws all nine states of docs/ARTE-REALISTA.md §4.5, 'alarm' and
 * 'thinking' included). VELA's Portrait keeps a live instrument (VelaScope): the trace a sweeping beam
 * writes while she talks, one tick per letter, and the lamp's flicker timers (they were the blinks, §4.7).
 */
import type { Text } from '../../core/types';
import type { Mood, Speaker } from '../../story/types';
import { LeniaLens } from '../story/lens';
import { drawChoirArt, drawCommitteeArt } from './cast';
import { drawAlborPortrait, drawYouPortrait } from './characters';
import { ART_MOODS as VELA_MOODS, VelaScope, drawVelaArt, featherEdges, type ArtMood, type VelaDrawOptions, type VelaPose } from './vela';

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

/** Every story mood is a VELA state now (§4.7); anything unknown shows her idle screen. */
function velaMood(m: ArtMood | Mood): ArtMood {
  return (VELA_MOODS as readonly string[]).includes(m) ? (m as ArtMood) : 'neutral';
}

/** One pose reused for every VELA frame (no object per frame). */
const velaPose: VelaPose = { mood: 'neutral', moodAge: 0, talk: 0, talking: false, blink: 0, reduceMotion: false, wear: [] };

export function drawVela(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, opts: VelaDrawOptions = {}): void {
  velaPose.mood = velaMood(s.mood);
  velaPose.moodAge = s.moodAge;
  velaPose.talk = s.talk;
  velaPose.talking = s.talking;
  velaPose.blink = s.blink;
  velaPose.reduceMotion = s.reduceMotion;
  velaPose.wear = s.wear ?? velaWear;
  drawVelaArt(ctx, velaPose, t, opts);
}

/** Dr. Albor as a chibi scientist (docs/ARTE.md §6.6): a sepia memory with a cassette on tape, in colour live. */
export function drawAlbor(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  drawAlborPortrait(ctx, s, t);
}

export function drawCommittee(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  drawCommitteeArt(ctx, s, t);
}

export function drawChoir(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, lens: LeniaLens | null): void {
  drawChoirArt(ctx, s, t, lens);
}

/** You: the night-shift scientist in the look picked in the intro, writing in the field notebook. */
export function drawYou(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  drawYouPortrait(ctx, s, t);
}

/** `opts` (VELA only): `mini` is the 24–56-px avatar (Portrait picks it automatically), `close` the medium one, and the rest of VelaDrawOptions. */
export function drawPortrait(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, lens: LeniaLens | null, opts: VelaDrawOptions = {}): void {
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

/** Below this CSS size VELA is drawn as the simplified avatar: bezel, screen and lamp (§4.8). */
export const MINI_BELOW = 56;

/** How a Portrait frames VELA: by size (mini below MINI_BELOW, else the whole instrument) or forced. */
export type VelaFraming = 'auto' | 'full' | 'close' | 'mini';

/**
 * Lamp flicker timers per state (§4.7: the eye blinks became the filament's dips). `every` is the interval
 * range (s), `close` / `open` the dip's fall and recovery (s). The worried filament sags often and briefly
 * (with the ±22 % of velaLamp, «un filamento que flojea»); standby and alarm never dip.
 */
const FLICKER: Record<ArtMood, { every: [number, number]; close: number; open: number }> = {
  neutral: { every: [3.5, 7], close: 0.05, open: 0.12 },
  happy: { every: [4, 8], close: 0.05, open: 0.12 },
  worried: { every: [0.5, 1.6], close: 0.04, open: 0.09 },
  awed: { every: [6, 9], close: 0.05, open: 0.12 },
  sleepy: { every: [60, 90], close: 0.2, open: 0.4 },
  proud: { every: [4, 8], close: 0.05, open: 0.12 },
  alarm: { every: [60, 90], close: 0.05, open: 0.12 },
  thinking: { every: [3, 6], close: 0.05, open: 0.12 },
};

/** Voice bands of the typewriter's talk target: silence, consonant (≤ 0.5), vowel (≥ 0.75). */
const bandOf = (v: number): number => (v < 0.2 ? 0 : v < 0.62 ? 1 : 2);

/**
 * A portrait canvas with its own lamp-flicker timer and smoothing. Call `frame()` every animation frame
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
  /** VELA's framing (default: by size). The dialogue may ask for 'close', the screen-and-lamp close-up (§6.10). */
  framing: VelaFraming = 'auto';
  /** What VELA's alarm band names (default «PLACA LLENA» / "DISH FULL"). */
  alarmLabel: Text | null = null;
  /** VELA's live trace and lamp (sweep, persistence, ticks, thermal inertia). */
  readonly scope = new VelaScope();
  private nextBlink = 2;
  private blinkT = -1;
  /** Deterministic jitter for flicker intervals (no Math.random in art code). */
  private seed = 0x9e3779b9;
  private lens: LeniaLens | null = null;
  private band = 0;
  private readonly opts: VelaDrawOptions = { mini: false, close: false, scope: null, size: 100, dpr: 1, lang: 'es', alarm: null };

  /**
   * CSS width as the layout last reported it (ResizeObserver): fit() runs every frame, and reading
   * clientWidth there forced a synchronous layout whenever the page had changed since the last one.
   */
  private cssW = -1;

  constructor(className = 'sty-portrait') {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver((entries) => {
        const e = entries[entries.length - 1];
        if (e) this.cssW = e.contentRect.width;
      }).observe(this.canvas);
    }
  }

  set(speaker: PortraitState['speaker'], mood: ArtMood | Mood, live = false): void {
    if (speaker !== this.state.speaker || mood !== this.state.mood) this.state.moodAge = 0;
    if (speaker !== this.state.speaker) this.scope.reset();
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

  /**
   * One letter typed (VELA): a blip on her trace where the beam is writing (§4.6). `frame` already ticks on
   * every rise of the talk target (a syllable); a host whose typewriter knows each letter may call this too.
   */
  tick(): void {
    if (this.state.speaker === 'vela' && !this.state.reduceMotion) this.scope.tick();
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
    // Before the first observation (or without ResizeObserver) the layout is read, once a frame at most.
    if (this.cssW < 0 || typeof ResizeObserver !== 'function') this.cssW = this.canvas.clientWidth;
    const css = this.cssW || 100;
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
    // Age the Choir's rings in place (no new arrays per frame).
    let n = 0;
    for (let i = 0; i < s.pulses.length; i++) {
      const p = s.pulses[i] + dt;
      if (p < 1.6) s.pulses[n++] = p;
    }
    s.pulses.length = n;
    const b = FLICKER[(s.mood as ArtMood) in FLICKER ? (s.mood as ArtMood) : 'neutral'];
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
    if (s.reduceMotion) s.blink = 0;
    if (s.speaker === 'coro' && this.lens && !s.reduceMotion) this.lens.update(dt);
    this.fit();
    const o = this.opts;
    if (s.speaker === 'vela') {
      // A tick on every rise of the voice (word starts and vowels): the typewriter's letters on the trace.
      const band = talking ? bandOf(talkTarget) : 0;
      if (band > this.band && dt > 0) this.tick();
      this.band = band;
      velaPose.mood = velaMood(s.mood);
      velaPose.moodAge = s.moodAge;
      velaPose.talk = s.talk;
      velaPose.talking = talking;
      velaPose.blink = s.blink;
      velaPose.reduceMotion = s.reduceMotion;
      this.scope.step(t, dt, velaPose);
      const f = this.framing === 'auto' ? (this.sizePx < MINI_BELOW ? 'mini' : 'full') : this.framing;
      o.mini = f === 'mini';
      o.close = f === 'close';
      o.scope = this.scope;
      o.size = this.sizePx;
      o.dpr = this.dpr;
      o.lang = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'es';
      o.alarm = this.alarmLabel;
    } else {
      o.mini = this.sizePx < MINI_BELOW;
      o.close = false;
      o.scope = null;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const k = (this.sizePx * this.dpr) / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawPortrait(ctx, s, t, this.lens, o);
    featherEdges(ctx, 4);
  }
}

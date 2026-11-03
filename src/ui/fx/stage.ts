/**
 * The dish's effect state shared by the overlay (which hears the game's events through the UI) and
 * src/main.ts (which drives the renderer): light pulses and heartbeats for the shader (A-4), the
 * living camera (A-9), the matter tracks the overlay anchors to (§3.7), the time's-up freeze (A-12)
 * and the effects profile (§6.1). One instance per page (`dishFx`); everything is preallocated, so a
 * frame allocates nothing.
 */
import type { Quality } from '../../core/types';
import { MAX_FORMING, MAX_PULSES } from '../../sim/shaders';
import { Shake } from './shake';
import { MatterTracks } from './tracks';
import { FX_PROFILE, type FxProfile } from './types';

export const PULSE = { sow: 0, birth: 1, dissolve: 2 } as const;
export type PulseKind = (typeof PULSE)[keyof typeof PULSE];

/** A-12: the dish greys and dims over 300 ms when time is up, and comes back as fast. */
export const FREEZE_S = 0.3;

export class DishFx {
  quality: Quality = 'medium';
  profile: FxProfile = FX_PROFILE.medium;
  readonly shake = new Shake();
  readonly tracks = new MatterTracks();
  /** Dish step being drawn (src/main.ts sets it every frame; the overlay anchors to it). */
  simStep = 0;
  /** Effect clock (s): the shader's pulses are timed on it. */
  time = 0;
  /** A-6 matter fade the renderer draws with (main.ts), read by the overlay to hide unlit creatures. */
  matterFade = 1;
  /** A-12 target (1 while time is up) and its animated value. */
  freezeTarget = 0;
  freeze = 0;
  reduceMotion = false;
  /** A finger is on the dish (a drag or a long press): the camera holds still. */
  pointerDown = false;

  /** Light pulses (x, y, t0, kind) + (radius, amount, duration, 0), oldest replaced first. */
  readonly pulseA = new Float32Array(MAX_PULSES * 4);
  readonly pulseB = new Float32Array(MAX_PULSES * 4);
  pulseN = 0;

  /** Heartbeats of forming creatures (x, y, r, brightness offset), written by the overlay each frame. */
  readonly form = new Float32Array(MAX_FORMING * 4);
  formN = 0;
  private formW = new Float32Array(MAX_FORMING * 4);
  private formWN = 0;

  configure(q: Quality): void {
    this.quality = q;
    this.profile = FX_PROFILE[q];
  }

  /** A light pulse on the dish (grid cells, seconds). */
  pulse(x: number, y: number, radius: number, kind: PulseKind, amount: number, duration: number): void {
    if (!(radius > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    let i = this.pulseN;
    if (i >= MAX_PULSES) {
      // Replace the oldest.
      i = 0;
      for (let k = 1; k < MAX_PULSES; k++) if (this.pulseA[k * 4 + 2] < this.pulseA[i * 4 + 2]) i = k;
    } else this.pulseN++;
    const a = this.pulseA;
    const b = this.pulseB;
    a[i * 4] = x;
    a[i * 4 + 1] = y;
    a[i * 4 + 2] = this.time;
    a[i * 4 + 3] = kind;
    b[i * 4] = radius;
    b[i * 4 + 1] = amount;
    b[i * 4 + 2] = duration;
    b[i * 4 + 3] = 0;
  }

  /** The overlay starts listing this frame's forming creatures. */
  beginForming(): void {
    this.formWN = 0;
  }

  addForming(x: number, y: number, r: number, beat: number): void {
    if (this.formWN >= MAX_FORMING) return;
    const k = this.formWN++ * 4;
    this.formW[k] = x;
    this.formW[k + 1] = y;
    this.formW[k + 2] = r;
    this.formW[k + 3] = beat;
  }

  /** The overlay finished its list: it becomes what the renderer draws. */
  endForming(): void {
    this.form.set(this.formW);
    this.formN = this.formWN;
  }

  /** Advance the clock, the camera, the freeze, and drop finished pulses (src/main.ts, every frame). */
  tick(dt: number): void {
    const d = Math.max(0, Math.min(0.25, dt));
    this.time += d;
    this.shake.update(d, this.reduceMotion || this.pointerDown);
    const step = d / FREEZE_S;
    this.freeze = this.freezeTarget > this.freeze ? Math.min(this.freezeTarget, this.freeze + step) : Math.max(this.freezeTarget, this.freeze - step);
    // Compact: keep the pulses still glowing (duration + a short tail).
    const a = this.pulseA;
    const b = this.pulseB;
    let n = 0;
    for (let i = 0; i < this.pulseN; i++) {
      if (this.time - a[i * 4 + 2] > b[i * 4 + 2] + 0.25) continue;
      if (n !== i) {
        for (let k = 0; k < 4; k++) {
          a[n * 4 + k] = a[i * 4 + k];
          b[n * 4 + k] = b[i * 4 + k];
        }
      }
      n++;
    }
    this.pulseN = n;
  }
}

export const dishFx = new DishFx();

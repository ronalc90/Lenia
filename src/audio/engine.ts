/**
 * AudioCore: the whole sound engine on top of any BaseAudioContext.
 *
 * It is clock-agnostic: callers pass `now` to every method and call
 * `tick(now)` periodically. The realtime wrapper (audio.ts) passes
 * `AudioContext.currentTime` from a 50 ms interval; the offline renderer
 * (offlineRender.ts) suspends an OfflineAudioContext every 50 ms and does
 * the same. Both run exactly the same graph and scheduling code.
 *
 * Nothing here calls disconnect() based on `now`; finished nodes are
 * disconnected from `onended` callbacks, so it is safe with any clock.
 */
import type { GameEvents } from '../core/bus';
import { DEFAULT_AMBIENCE, DEFAULT_HARMONY, isDefaultAmbience, sameAmbience, sanitizeAmbience, scoreStyleOf, harmonyFor, type Ambience, type Harmony } from './ambience';
import { DEFAULT_REVERB, DEL_RETURN, REV_RETURN, buildGraph, glide, makeNoise, type MixGraph } from './fx';
import { LAYERS, PAD_CUTOFF, WIDTH, layerGain, targetLevel, type Layer, type MusicState } from './intensity';
import { hash32 } from './motifs';
import { SECONDS_PER_BAR, SECONDS_PER_BEAT } from './progression';
import { Composer, signatureFor, type NoteEvent, type Signature } from './score';
import { EXTINCTION_NOTE_AT, EXTINCTION_SWEEP, SfxPlayer, SliderTone, type SfxName } from './sfx';

/** Sounds the UI can request directly. */
export type UISound = 'tap' | 'tab' | 'open' | 'close' | 'buy' | 'deny' | 'toggle' | 'hold' | 'confirm';

/** 'buy' maps to nothing: purchases already sound through the upgradeBought event. */
const UI_SFX: Record<UISound, SfxName | null> = {
  tap: 'uiTap',
  tab: 'uiTab',
  open: 'uiOpen',
  close: 'uiClose',
  buy: null,
  deny: 'seedDenied',
  toggle: 'uiToggle',
  hold: 'uiHold',
  confirm: 'uiConfirm',
};
import { Instruments, Pad, VOICE_CAP, type NoiseBank } from './synth';
import type { Chord } from './theory';

export interface CoreOptions {
  /** Seconds of audio scheduled ahead of `now` (default 0.3). */
  lookahead?: number;
  /** Linear trim after the limiter. */
  trim?: number;
  /** Dish width in grid cells, for panning effects by x. */
  dishWidth?: number;
}

interface Timed {
  time: number;
  e: NoteEvent;
}

type ExtPhase = 'none' | 'sweep' | 'silent' | 'reenter';

const DEFAULT_STATE: MusicState = { eps: 0, species: 0, creatures: 0, era: 1, behaviors: 0, paused: false };

/** Resting high-pass of the music strip (trims sub-sonic rumble). */
export const MUSIC_HP_REST = 30;

/** Overall music loudness knob (linear, applied on the music strip). */
export const MUSIC_LEVEL = 1.35;

/** Delay time of the ping-pong: a dotted eighth. */
export const DELAY_TIME = SECONDS_PER_BEAT * 0.75;

export function eraSeed(era: number): number {
  return hash32('bioluma', era);
}

export class AudioCore {
  readonly ctx: BaseAudioContext;
  readonly graph: MixGraph;
  readonly inst: Instruments;
  readonly sfx: SfxPlayer;
  private pad: Pad;
  private composer: Composer;
  private slider: SliderTone;
  private lookahead: number;
  private dishWidth: number;

  private started = false;
  private nextBar = 0;
  private nextBarTime = 0;
  /** Reference point of the bar grid (last planned bar). */
  private refBar = 0;
  private refTime = 0;
  private queue: Timed[] = [];
  private layerEnds: Record<Layer, number[]> = { pad: [], bass: [], arp: [], mel: [], perc: [], orn: [] };

  private state: MusicState = { ...DEFAULT_STATE };
  private target = 0;
  private level = 0;
  private lowerBars = 0;
  private signatures: Signature[] = [];
  private fresh: Signature | null = null;
  private era = 1;
  private pendingReseed = false;

  private vol = { sfx: 0.8, music: 0.6, muted: true };
  private volSet = false;
  private idle = false;
  private paused = false;
  /** Extinction ritual state; `done` = the new era was announced during the sweep. */
  private ext: { phase: ExtPhase; cutAt: number; reenterAt: number; done: boolean } = { phase: 'none', cutAt: 0, reenterAt: 0, done: false };
  private disposed = false;
  /** Music ambience (cosmetic preset): tempo, harmony, timbres, room. Applied on a bar line. */
  private amb: Ambience = DEFAULT_AMBIENCE;
  private pendingAmb: Ambience | null = null;
  private harmony: Harmony = DEFAULT_HARMONY;
  private spb = SECONDS_PER_BEAT;
  private spBar = SECONDS_PER_BAR;

  constructor(ctx: BaseAudioContext, opts: CoreOptions = {}) {
    this.ctx = ctx;
    this.lookahead = opts.lookahead ?? 0.3;
    this.dishWidth = opts.dishWidth ?? 192;
    this.graph = buildGraph(ctx, { delayTime: DELAY_TIME, trim: opts.trim });
    const sr = ctx.sampleRate;
    const mk = (kind: 'white' | 'pink' | 'brown', seconds: number, seed: number): AudioBuffer => {
      const b = ctx.createBuffer(1, Math.floor(seconds * sr), sr);
      b.getChannelData(0).set(makeNoise(kind, b.length, seed));
      return b;
    };
    const noise: NoiseBank = { white: mk('white', 2, 11), pink: mk('pink', 2, 12), brown: mk('brown', 2, 13) };
    this.inst = new Instruments(this.graph, noise);
    this.pad = new Pad(this.inst, this.graph.layerIn.pad, 0);
    this.composer = new Composer(eraSeed(1));
    this.sfx = new SfxPlayer(this.graph, this.inst, (t) => this.chordAt(t));
    this.slider = new SliderTone(this.graph.sfxIn.dry, ctx);
  }

  // ───────────────────────────── timeline ─────────────────────────────

  /** Start the score; the first bar begins at `at`. */
  start(at: number): void {
    if (this.started) return;
    this.started = true;
    this.nextBar = 0;
    this.nextBarTime = at;
    this.refBar = 0;
    this.refTime = at;
    this.applyMusicVol(at, 2.0);
    this.applyFilters(at);
  }

  get isStarted(): boolean {
    return this.started;
  }

  /** Current intensity level (0..5). */
  get currentLevel(): number {
    return this.level;
  }

  /** Bar index sounding at time t (may be negative before the start). */
  barAt(t: number): number {
    return this.refBar + Math.floor((t - this.refTime) / this.spBar + 1e-9);
  }

  chordAt(t: number): Chord {
    return this.harmony.barInfo(Math.max(0, this.barAt(t))).chord;
  }

  /** Next grid point at or after t, `div` in beats (0.25 = sixteenth). */
  grid(t: number, div: number): number {
    if (!this.started || this.ext.phase !== 'none') return t;
    const beats = (t - this.refTime) / this.spb;
    const q = Math.ceil(beats / div - 1e-6) * div;
    return this.refTime + q * this.spb;
  }

  /** Schedule everything up to now + lookahead. Call every ~50 ms. */
  tick(now: number): void {
    if (!this.started || this.disposed) return;
    this.slider.tick(now);
    if (this.ext.phase === 'sweep' && now >= this.ext.cutAt) this.ext.phase = this.ext.done ? 'reenter' : 'silent';
    const horizon = now + this.lookahead;
    // Fell behind (throttled timers, suspended context): skip to the future.
    if (this.nextBarTime < now - 0.05) {
      const missed = Math.ceil((now - this.nextBarTime) / this.spBar);
      this.nextBar += missed;
      this.nextBarTime += missed * this.spBar;
      this.queue = this.queue.filter((q) => q.time >= now);
    }
    while (this.nextBarTime < horizon) {
      this.planBar(this.nextBarTime);
      this.nextBar++;
      this.nextBarTime += this.spBar; // after planBar: a tempo change starts on this bar line
    }
    let i = 0;
    while (i < this.queue.length && this.queue[i].time < horizon) {
      const q = this.queue[i++];
      if (q.time >= now - 0.02) this.playNote(q.e, Math.max(q.time, now));
    }
    if (i > 0) this.queue.splice(0, i);
  }

  private planBar(tb: number): void {
    // Extinction re-entry: restart the form from bar 0 at a quiet level.
    if (this.ext.phase === 'reenter' && tb >= this.ext.reenterAt) {
      this.ext.phase = 'none';
      this.composer.reset(eraSeed(this.era));
      this.pendingReseed = false;
      this.nextBar = 0;
      this.level = 0;
      this.lowerBars = 0;
      this.graph.musicHighpass.glide(MUSIC_HP_REST, tb, 0.05);
      glide(this.pad.resonance, 0.7, tb, 0.05);
      this.applyFilters(tb);
      this.applyMusicVol(tb, 1.8);
    }
    if (this.pendingAmb) {
      const a = this.pendingAmb;
      this.pendingAmb = null;
      this.applyAmbience(a, tb, true);
    }
    this.refBar = this.nextBar;
    this.refTime = tb;
    if (this.ext.phase === 'silent' || this.ext.phase === 'reenter' || (this.ext.phase === 'sweep' && tb >= this.ext.cutAt - 0.01)) {
      return; // music is cut
    }
    if (this.pendingReseed && this.harmony.barInfo(this.nextBar).barInSection === 0) {
      this.composer.reset(eraSeed(this.era));
      this.pendingReseed = false;
    }
    // Levels move one step per bar; going down waits two bars first.
    if (this.target > this.level) {
      this.level++;
      this.lowerBars = 0;
    } else if (this.target < this.level) {
      this.lowerBars++;
      if (this.lowerBars >= 2) this.level--;
    } else {
      this.lowerBars = 0;
    }
    const plan = this.composer.plan(this.nextBar, this.level, { signatures: this.signatures, fresh: this.fresh });
    this.fresh = null;
    // Layer fades on the bar line: in over ~1 bar, out a little slower.
    for (const L of LAYERS) {
      const g = layerGain(L, this.level);
      const param = this.graph.layerGain[L].gain;
      glide(param, g, tb, g > 0 ? 0.7 : 0.9);
    }
    glide(this.pad.cutoff, PAD_CUTOFF[this.level], tb, 1.5);
    this.pad.setWidth(WIDTH[this.level], tb);
    const sweeping = this.ext.phase === 'sweep';
    // During the extinction sweep the pad holds its voicing until the cut;
    // with the music silenced the pad oscillators are released (CPU).
    if (this.vol.muted || this.vol.music <= 0) this.pad.releaseAll(tb, 0.2);
    else if (!sweeping) this.pad.set(plan.pad, tb);
    for (const e of plan.events) {
      const time = tb + e.beat * this.spb;
      if (!sweeping || time < this.ext.cutAt) this.queue.push({ time, e });
    }
    this.queue.sort((a, b) => a.time - b.time);
  }

  private canStart(layer: Layer, t: number, end: number): boolean {
    const ends = this.layerEnds[layer].filter((x) => x > t);
    this.layerEnds[layer] = ends;
    if (ends.length >= VOICE_CAP[layer]) return false;
    ends.push(end);
    return true;
  }

  private playNote(e: NoteEvent, t: number): void {
    if (this.vol.muted || this.vol.music <= 0) return;
    const inst = this.inst;
    const L = this.graph.layerIn;
    const durS = e.dur * this.spb;
    switch (e.inst) {
      case 'pluck':
        if (this.canStart('arp', t, t + (e.dur < 0.6 ? 0.9 : 1.4))) inst.arpNote(inst.pan(L.arp, e.pan), t, e.midi, e.vel, e.dur < 0.6);
        break;
      case 'bell':
        if (this.canStart('mel', t, t + 2.5)) inst.leadNote(inst.pan(L.mel, e.pan), t, e.midi, e.vel, false, durS);
        break;
      case 'echo':
        if (this.canStart('mel', t, t + 2)) inst.leadNote(inst.pan(L.mel, e.pan), t, e.midi, e.vel, true, durS);
        break;
      case 'bass':
        if (this.canStart('bass', t, t + durS + 0.3)) inst.bassNote(L.bass, t, e.midi, e.vel, durS);
        break;
      case 'kick':
        if (this.canStart('perc', t, t + 0.47)) inst.kick(L.perc, t, e.vel);
        break;
      case 'rim':
        if (this.canStart('perc', t, t + 0.16)) inst.rim(inst.pan(L.perc, e.pan), t, e.vel);
        break;
      case 'hat':
        if (this.canStart('perc', t, t + 0.14)) inst.hat(t, e.vel);
        break;
      case 'shaker':
        if (this.canStart('perc', t, t + 0.07)) inst.shaker(t, e.vel);
        break;
      case 'glint':
        if (this.canStart('orn', t, t + 0.72)) inst.glint(inst.pan(L.orn, e.pan), t, e.midi, e.vel);
        break;
      case 'sig':
        if (this.canStart('orn', t, t + 1.8)) inst.sig(inst.pan(L.orn, e.pan), t, e.midi, e.vel);
        break;
    }
  }

  // ───────────────────────────── controls ─────────────────────────────

  /**
   * Music ambience (src/store MUSICS presets). Before the score starts it applies at once;
   * afterwards on the next bar line, so tempo, harmony and timbres change smoothly. SFX are
   * unaffected (they keep following the sounding chord, as always).
   */
  setAmbience(preset: Ambience, now: number): void {
    const a = sanitizeAmbience(preset);
    if (sameAmbience(a, this.pendingAmb ?? this.amb)) return;
    if (!this.started) {
      this.pendingAmb = null;
      this.applyAmbience(a, now, false);
    } else {
      this.pendingAmb = a;
    }
  }

  get ambience(): Readonly<Ambience> {
    return this.amb;
  }

  private applyAmbience(a: Ambience, t: number, crossfade: boolean): void {
    const prev = this.amb;
    this.amb = a;
    const def = isDefaultAmbience(a);
    if (a.bpm !== prev.bpm) {
      this.spb = def ? SECONDS_PER_BEAT : 60 / a.bpm;
      this.spBar = def ? SECONDS_PER_BAR : this.spb * 4;
      this.graph.delayTime.glide(this.spb * 0.75, t, 0.25);
    }
    this.harmony = def ? DEFAULT_HARMONY : harmonyFor(a.mode, a.tonic);
    this.composer.setHarmony(this.harmony);
    this.composer.setStyle(scoreStyleOf(a));
    const padChanged = a.pad !== prev.pad || a.detune !== prev.detune;
    this.inst.setTimbres({ pad: a.pad, arp: a.arp, lead: a.lead, bass: a.bass }, a.detune);
    // Restart the pad voices with the new wave; planBar sets the voicing right after (cross-fade).
    if (padChanged && crossfade) this.pad.releaseAll(t, 0.6);
    const sameRoom =
      a.reverb.rt60 === DEFAULT_AMBIENCE.reverb.rt60 &&
      a.reverb.brightHz === DEFAULT_AMBIENCE.reverb.brightHz &&
      a.reverb.darkHz === DEFAULT_AMBIENCE.reverb.darkHz;
    this.graph.setMusicRoom(
      {
        reverb: sameRoom ? null : { ...DEFAULT_REVERB, ...a.reverb, seconds: Math.min(5, Math.max(2.4, a.reverb.rt60 + 0.4)) },
        revScale: a.reverbMix / DEFAULT_AMBIENCE.reverbMix,
        delScale: a.delayMix / DEFAULT_AMBIENCE.delayMix,
      },
      t,
      crossfade ? 1.2 : 0.01,
    );
  }

  setState(s: MusicState, now: number): void {
    const prev = this.state;
    this.state = { ...s };
    if (s.paused !== this.paused) {
      this.paused = s.paused;
      this.applyFilters(now);
      this.applyMusicVol(now);
    }
    const era = Math.max(1, Math.floor(s.era || 1));
    if (era !== this.era) {
      this.era = era;
      this.signatures = [];
      if (this.ext.phase === 'none') this.pendingReseed = true;
    }
    if (s.extinction && !prev.extinction) this.beginExtinction(now);
    else if (!s.extinction && prev.extinction) this.endExtinction(now);
    this.target = targetLevel(s, this.level);
  }

  setVolumes(sfx: number, music: number, muted: boolean, now: number): void {
    const next = { sfx: clamp01(sfx), music: clamp01(music), muted };
    if (this.volSet && next.sfx === this.vol.sfx && next.music === this.vol.music && next.muted === this.vol.muted) return;
    this.volSet = true;
    this.vol = next;
    this.graph.sfxVol.glide(volumeCurve(this.vol.sfx), now, 0.05);
    this.applyMusicVol(now);
    glide(this.graph.out.gain, muted ? 0 : 1, now, muted ? 0.04 : 0.08);
  }

  setIdle(idle: boolean, now: number): void {
    if (idle === this.idle) return;
    this.idle = idle;
    this.applyMusicVol(now, 1.2);
  }

  setDishWidth(w: number): void {
    if (w > 0) this.dishWidth = w;
  }

  private musicTarget(): number {
    if (this.ext.phase === 'silent' || this.ext.phase === 'reenter') return 0;
    const v = volumeCurve(this.vol.music) * MUSIC_LEVEL;
    return v * (this.idle ? 0.7 : 1) * (this.paused ? 0.4 : 1);
  }

  private applyMusicVol(now: number, tau = 0.25): void {
    this.graph.musicVol.glide(this.musicTarget(), now, tau);
    if (this.ext.phase === 'sweep') this.graph.musicVol.glide(0, Math.max(now, this.ext.cutAt), 0.03);
  }

  private applyFilters(now: number): void {
    this.graph.musicLowpass.glide(this.paused ? 650 : 20000, now, this.paused ? 0.25 : 0.4);
    if (this.ext.phase === 'none') this.graph.musicHighpass.glide(MUSIC_HP_REST, now, 0.1);
  }

  private beginExtinction(now: number): void {
    if (this.ext.phase === 'sweep' || this.ext.phase === 'silent') return;
    this.ext = { phase: 'sweep', cutAt: now + EXTINCTION_SWEEP, reenterAt: Infinity, done: false };
    glide(this.pad.cutoff, 7000, now, 1.0);
    glide(this.pad.resonance, 5, now, 1.0);
    this.graph.musicHighpass.glide(1400, now, 1.1);
    this.applyMusicVol(now);
    this.pad.releaseAll(this.ext.cutAt, 0.03);
    // Cut means silence: duck the reverb/delay returns at the cut, then let
    // them bloom back for the single closing note.
    const g = this.graph;
    glide(g.revReturn.gain, 0, this.ext.cutAt, 0.02);
    glide(g.delReturn.gain, 0, this.ext.cutAt, 0.02);
    g.revReturn.gain.setTargetAtTime(REV_RETURN, this.ext.cutAt + EXTINCTION_NOTE_AT - EXTINCTION_SWEEP, 1.0);
    g.delReturn.gain.setTargetAtTime(DEL_RETURN, this.ext.cutAt + EXTINCTION_NOTE_AT - EXTINCTION_SWEEP, 1.0);
    this.queue = this.queue.filter((q) => q.time < this.ext.cutAt);
    this.sfx.play('extinction', now);
  }

  private endExtinction(now: number): void {
    if (this.ext.phase === 'none' || this.ext.phase === 'reenter') return;
    // The game announces the new era in the same tick as the start: let the
    // sweep finish, the cut and the single note ring, then re-enter.
    this.ext.reenterAt = Math.max(now + 0.5, this.ext.cutAt + EXTINCTION_NOTE_AT + 1.5);
    if (this.ext.phase === 'sweep') this.ext.done = true;
    else this.ext.phase = 'reenter';
    this.signatures = [];
    this.target = 0;
  }

  // ───────────────────────────── events ─────────────────────────────

  private panX(x: number): number {
    return Math.max(-1, Math.min(1, (x / this.dishWidth) * 2 - 1)) * 0.5;
  }

  private play(name: SfxName, t: number, opts?: { gain?: number; pan?: number; key?: string; minInterval?: number }): void {
    if (this.vol.muted || this.vol.sfx <= 0) return;
    this.sfx.play(name, t, opts);
  }

  /** Interface sound (button taps, tabs, modals). */
  playUI(kind: UISound, now: number): void {
    if (this.disposed) return;
    const name = UI_SFX[kind];
    if (name) this.play(name, now + 0.005);
  }

  /** React to a game event at time `now`. */
  handle<K extends keyof GameEvents>(type: K, payload: GameEvents[K], now: number): void {
    if (this.disposed) return;
    const t = now + 0.005;
    switch (type) {
      case 'seed': {
        const p = payload as GameEvents['seed'];
        if (!p.manual && this.idle) return;
        // Auto-seeder: −12 dB and at most ~3 per second.
        if (p.manual) this.play('seed', t, { pan: this.panX(p.x) });
        else this.play('seed', t, { gain: 0.25, pan: this.panX(p.x), key: 'seedAuto', minInterval: 0.3 });
        break;
      }
      case 'seedDenied':
        this.play('seedDenied', t);
        break;
      case 'creatureStable':
        this.play('stable', this.grid(t, 0.25), { pan: this.panX((payload as GameEvents['creatureStable']).x) });
        break;
      case 'creatureDied':
        this.play('died', t, { pan: this.panX((payload as GameEvents['creatureDied']).x), gain: 0.8 });
        break;
      case 'creatureExploded':
        this.play('exploded', t, { pan: this.panX((payload as GameEvents['creatureExploded']).x) });
        break;
      case 'creatureDivided':
        this.play('divided', this.grid(t, 0.25), { pan: this.panX((payload as GameEvents['creatureDivided']).x) });
        break;
      case 'income':
        this.play('income', this.grid(t, 0.5), { pan: this.panX((payload as GameEvents['income']).x) });
        break;
      case 'speciesNew': {
        const p = payload as GameEvents['speciesNew'];
        const rare = p.rarity === 'rare' || p.rarity === 'veryRare';
        this.play(rare ? 'speciesRare' : 'speciesNew', t, { pan: this.panX(p.x) * 0.6 });
        const sig = signatureFor(p.speciesId);
        if (!this.signatures.some((s) => s.degree === sig.degree && s.octave === sig.octave && s.figure === sig.figure)) {
          this.signatures.push(sig);
          if (this.signatures.length > 8) this.signatures.shift();
        }
        this.fresh = sig;
        break;
      }
      case 'behaviorNew':
        this.play('behavior', this.grid(t, 0.5));
        break;
      case 'upgradeBought':
        this.play('purchase', t);
        break;
      case 'genomeBought':
        this.play('genome', t);
        break;
      case 'journalNew':
        this.play('journal', t);
        break;
      case 'achievement':
        this.play('achievement', t + 0.04);
        break;
      case 'extinctionStart':
        this.beginExtinction(now);
        break;
      case 'extinctionDone': {
        const p = payload as GameEvents['extinctionDone'];
        if (p.era && p.era !== this.era) {
          this.era = Math.max(1, Math.floor(p.era));
        }
        this.endExtinction(now);
        break;
      }
      case 'goldenSpawn':
        this.play('goldenSpawn', t, { pan: this.panX((payload as GameEvents['goldenSpawn']).x) });
        break;
      case 'goldenCollected':
        this.play('goldenCollected', t, { pan: this.panX((payload as GameEvents['goldenCollected']).x) * 0.6 });
        break;
      case 'goldenMissed':
        this.play('goldenMissed', t);
        break;
      case 'calibrationChanged':
        // (The game also resets calibration during the extinction ritual: stay silent then.)
        if (!this.vol.muted && this.vol.sfx > 0 && this.ext.phase === 'none') this.slider.update((payload as GameEvents['calibrationChanged']).mu, t);
        break;
      case 'offlineReturn':
        this.play('offline', t + 0.1);
        break;
      default:
        break;
    }
  }

  dispose(now: number): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pad.dispose(now);
    glide(this.graph.out.gain, 0, now, 0.02);
    this.queue = [];
  }

  /** Disconnect the fixed graph (after the context is closed or the render finished). */
  disconnectAll(): void {
    this.graph.dispose();
  }
}

/** Slider 0..1 → linear gain (v^1.5: 0.5 ≈ −9 dB, 0.7 ≈ −4.6 dB). */
export function volumeCurve(v: number): number {
  return Math.pow(clamp01(v), 1.5);
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

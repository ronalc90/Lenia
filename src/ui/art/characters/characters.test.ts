import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawPortrait, type PortraitState } from '../portraits';
import {
  ALBOR,
  COAT_IDS,
  DOCTOR_MOODS,
  HAND_POSES,
  LOOK_STORAGE_KEY,
  PLAYER_LOOK_IDS,
  PLAYER_LOOK_NAMES,
  doctorMood,
  drawAlborPolaroid,
  drawAlborPortrait,
  drawAlborProfile,
  drawBataCard,
  drawDoctorAt,
  drawDoctorBust,
  drawGlovedHand,
  drawYouPortrait,
  playerSpec,
  type DoctorPose,
  type Gesture,
  type PeoplePose,
} from './index';

/** A recording context: logs calls and the device-space path vertices (see portraits.test.ts). */
function recorder() {
  const log: string[] = [];
  const pts: [number, number][] = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const put = (x: number, y: number) => pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const grad = { addColorStop: () => undefined };
  const impl: Record<string, (...a: number[]) => unknown> = {
    save: () => void stack.push([...m]),
    restore: () => void (m = stack.pop() ?? [1, 0, 0, 1, 0, 0]),
    translate: (x, y) => void (m = mul(m, [1, 0, 0, 1, x, y])),
    scale: (x, y) => void (m = mul(m, [x, 0, 0, y, 0, 0])),
    rotate: (a) => void (m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])),
    setTransform: (a, b, c, d, e, f) => void (m = [a, b, c, d, e, f]),
    moveTo: (x, y) => put(x, y),
    lineTo: (x, y) => put(x, y),
    quadraticCurveTo: (_a, _b, x, y) => put(x, y),
    bezierCurveTo: (_a, _b, _c, _d, x, y) => put(x, y),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key} got a non-finite number`);
        log.push(`${key}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : typeof a)).join(',')})`);
        return impl[key]?.(...(args as number[]));
      };
    },
    set(target, key: string, v) {
      log.push(`${key}=${typeof v === 'number' ? v.toFixed(3) : String(typeof v === 'object' ? 'obj' : v)}`);
      target[key] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, pts };
}

const inside = (pts: [number, number][], x0: number, y0: number, x1: number, y1: number, label: string) => {
  for (const [x, y] of pts) {
    expect(x, `${label} x`).toBeGreaterThanOrEqual(x0);
    expect(x, `${label} x`).toBeLessThanOrEqual(x1);
    expect(y, `${label} y`).toBeGreaterThanOrEqual(y0);
    expect(y, `${label} y`).toBeLessThanOrEqual(y1);
  }
};

const pose = (over: Partial<DoctorPose> = {}): DoctorPose => ({ mood: 'neutral', moodAge: 10, talk: 0, talking: false, blink: 0, reduceMotion: false, ...over });
const people = (over: Partial<PeoplePose> = {}): PeoplePose => ({ mood: 'neutral', moodAge: 10, talk: 0, talking: false, blink: 0, live: false, reduceMotion: false, ...over });
const count = (log: string[], call: string) => log.filter((l) => l.startsWith(call)).length;

afterEach(() => vi.restoreAllMocks());

describe('the people of scientific realism', () => {
  it('keep the saved look ids and storage key, with the coats’ new names in both languages', () => {
    expect(PLAYER_LOOK_IDS).toEqual(['curls', 'beanie', 'bun']);
    expect(COAT_IDS).toEqual(PLAYER_LOOK_IDS);
    expect(LOOK_STORAGE_KEY).toBe('bioluma.look');
    expect(PLAYER_LOOK_NAMES.curls).toEqual({ es: 'Bata clásica', en: 'Classic lab coat' });
    expect(PLAYER_LOOK_NAMES.beanie).toEqual({ es: 'Parka polar', en: 'Polar parka' });
    expect(PLAYER_LOOK_NAMES.bun).toEqual({ es: 'Cuello mao', en: 'Mandarin-collar coat' });
  });

  it('map the story moods onto the doctors’ (awed reads as surprised, alarm as worried)', () => {
    expect(doctorMood('awed')).toBe('surprised');
    expect(doctorMood('alarm')).toBe('worried');
    expect(doctorMood('thinking')).toBe('thinking');
    expect(doctorMood('whatever')).toBe('neutral');
  });

  it('draw the gloved hand in every pose with every coat, around its wrist', () => {
    for (const look of COAT_IDS)
      for (const p of HAND_POSES) {
        const r = recorder();
        drawGlovedHand(r.ctx, p, 0, 0, 1, look);
        expect(r.log.length, `${p} ${look}`).toBeGreaterThan(200);
        // The hand and the default sleeve (90 units) never reach further than this from the wrist.
        inside(r.pts, -130, -130, 130, 130, `${p} ${look}`);
      }
  });

  it('keep a hand with no sleeve inside a portrait box', () => {
    for (const look of COAT_IDS) {
      const r = recorder();
      drawGlovedHand(r.ctx, 'pen', 70, 70, 0.3, look, { sleeve: 0 });
      inside(r.pts, 50, 50, 90, 90, look);
    }
  });

  it('draw the three coats on the rack inside their tile, picked or not', () => {
    for (const id of COAT_IDS)
      for (const selected of [false, true, 0.5]) {
        const r = recorder();
        drawBataCard(r.ctx, id, 150, 240, 1.3, false, selected, { age: 0.3, lang: 'en' });
        expect(r.log.length, id).toBeGreaterThan(300);
        inside(r.pts, -1, -1, 151, 241, `${id} ${selected}`);
      }
  });

  it('lift a picked coat and swing its card, but under Reduce motion only the ring changes', () => {
    const draw = (selected: boolean | number, rm: boolean, age?: number, t = 1) => {
      const r = recorder();
      drawBataCard(r.ctx, 'curls', 150, 240, t, rm, selected, { age, lang: 'es' });
      return r.log;
    };
    expect(draw(1, false)).not.toEqual(draw(0, false));
    expect(draw(1, false, 0.2)).not.toEqual(draw(1, false, 2));
    // Reduce motion: no lift, no swing, no draft; the ring still shows the choice.
    expect(draw(1, true, 0.2, 1)).toEqual(draw(1, true, 3, 7.5));
    expect(draw(1, true)).not.toEqual(draw(0, true));
    expect(count(draw(1, true), 'stroke(') - count(draw(0, true), 'stroke(')).toBe(1);
  });

  it('draw Albor’s Polaroid, with or without the window photo, inside its frame', () => {
    for (const lang of ['es', 'en'] as const) {
      const r = recorder();
      drawAlborPolaroid(r.ctx, 20, 20, 60, 1, false, null, { lang });
      expect(r.log.length).toBeGreaterThan(300);
      inside(r.pts, 10, 10, 90, 100, lang);
      expect(r.log.some((l) => l.startsWith('fillText'))).toBe(true);
    }
  });

  it('change light and posture with the mood (Albor at dawn and your writing hand), never a face', () => {
    const profile = DOCTOR_MOODS.map((mood) => {
      const r = recorder();
      drawAlborProfile(r.ctx, 0, 0, 100, { mood, talk: 0, talking: false, reduceMotion: false, moodAge: 10 }, 0);
      inside(r.pts, -1, -1, 101, 101, `albor ${mood}`);
      return r.log.join('|');
    });
    expect(new Set(profile).size).toBe(DOCTOR_MOODS.length);
    for (const look of PLAYER_LOOK_IDS) {
      const you = DOCTOR_MOODS.map((mood) => {
        const r = recorder();
        drawYouPortrait(r.ctx, people({ mood }), 0, look);
        inside(r.pts, -1, -1, 101, 101, `you ${look} ${mood}`);
        return r.log.join('|');
      });
      expect(new Set(you).size, look).toBe(DOCTOR_MOODS.length);
    }
  });

  it('keep your writing hand inside the portrait at every instant, in every mood and coat', () => {
    for (const look of PLAYER_LOOK_IDS)
      for (const mood of DOCTOR_MOODS)
        for (let t = 0; t < 4; t += 0.31) {
          const r = recorder();
          drawYouPortrait(r.ctx, people({ mood, talking: true, talk: 0.7 }), t, look);
          inside(r.pts, -1, -1, 101, 101, `${look} ${mood} ${t.toFixed(2)}`);
        }
  });

  it('let the vapour out when Albor speaks, and keep one still puff under Reduce motion', () => {
    const puffs = (talking: boolean, rm: boolean, t: number) => {
      const r = recorder();
      drawAlborProfile(r.ctx, 0, 0, 100, { mood: 'happy', talk: talking ? 0.8 : 0, talking, reduceMotion: rm, moodAge: 10 }, t);
      return r.log;
    };
    const quiet = count(puffs(false, false, 1.3), 'createRadialGradient');
    expect(count(puffs(true, false, 1.3), 'createRadialGradient')).toBeGreaterThan(quiet);
    // The breath rises and opens: two instants differ while she talks.
    expect(puffs(true, false, 1.3)).not.toEqual(puffs(true, false, 1.75));
    expect(count(puffs(true, true, 1.3), 'createRadialGradient')).toBe(count(puffs(false, true, 1.3), 'createRadialGradient') + 1);
  });

  it('are deterministic, hold still under Reduce motion and never call Math.random', () => {
    const rnd = vi.spyOn(Math, 'random');
    const frame = (t: number, rm: boolean) => {
      const r = recorder();
      drawAlborPortrait(r.ctx, people({ talking: true, talk: 0.6, reduceMotion: rm }), t);
      drawAlborPortrait(r.ctx, people({ live: true, talking: true, talk: 0.6, reduceMotion: rm }), t);
      drawYouPortrait(r.ctx, people({ talking: true, talk: 0.6, reduceMotion: rm }), t, 'bun');
      drawBataCard(r.ctx, 'beanie', 120, 200, t, rm, true, { age: 0.4 });
      drawGlovedHand(r.ctx, 'reach', 50, 90, 1, 'curls');
      return r.log;
    };
    expect(frame(3.7, false)).toEqual(frame(3.7, false));
    expect(frame(1, true)).toEqual(frame(9.4, true));
    expect(frame(1, false)).not.toEqual(frame(2.2, false));
    expect(rnd).not.toHaveBeenCalled();
  });

  it('show up as the dialogue speakers: Albor on tape and live, and you, inside the box', () => {
    const st = (over: Partial<PortraitState>): PortraitState => ({
      speaker: 'albor',
      mood: 'neutral',
      moodAge: 1,
      talk: 0.5,
      talking: true,
      blink: 0,
      live: false,
      pulses: [],
      reduceMotion: false,
      ...over,
    });
    for (const s of [st({}), st({ live: true }), st({ mood: 'alarm', live: true }), st({ speaker: 'you' }), st({ speaker: 'you', mood: 'thinking' }), st({ speaker: 'vela', mood: 'thinking' })]) {
      const r = recorder();
      drawPortrait(r.ctx, s, 1.2, null);
      expect(r.log.length).toBeGreaterThan(60);
      inside(r.pts, -1, -1, 101, 101, `${s.speaker} ${s.mood} ${s.live}`);
    }
  });

  it('keep the old aliases working: the player is a hand or a coat, Albor is seen from behind', () => {
    const gestures: Gesture[] = ['rest', 'wave', 'chin', 'cheeks', 'hips', 'clasp', 'hold', 'point', 'write', 'walk'];
    for (const spec of [ALBOR, ...PLAYER_LOOK_IDS.map((id) => playerSpec(id))])
      for (const g of gestures) {
        const r = recorder();
        drawDoctorAt(r.ctx, spec, pose({ gesture: g, item: g === 'walk' ? 'suitcase' : undefined }), 1.5, 100, 200, 1);
        expect(r.log.length, `${spec.id} ${g}`).toBeGreaterThan(50);
      }
    for (const spec of [ALBOR, ...PLAYER_LOOK_IDS.map((id) => playerSpec(id))]) {
      const r = recorder();
      drawDoctorBust(r.ctx, spec, pose({ mood: 'happy' }), 1);
      expect(r.log.length, spec.id).toBeGreaterThan(50);
      inside(r.pts, -1, -1, 101, 136, spec.id);
    }
  });
});

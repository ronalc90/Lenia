import { describe, expect, it } from 'vitest';
import { drawPortrait, type PortraitState } from '../portraits';
import { ALBOR, DOCTOR_MOODS, PLAYER_LOOK_IDS, doctorMood, drawDoctorAt, drawDoctorBust, playerSpec, type DoctorPose, type Gesture } from './index';

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

const pose = (over: Partial<DoctorPose> = {}): DoctorPose => ({ mood: 'neutral', moodAge: 10, talk: 0, talking: false, blink: 0, reduceMotion: false, ...over });
const specs = [ALBOR, ...PLAYER_LOOK_IDS.map((id) => playerSpec(id))];

describe('the doctors', () => {
  it('draw every mood of every character inside the portrait box', () => {
    for (const spec of specs)
      for (const mood of DOCTOR_MOODS)
        for (const talking of [false, true]) {
          const r = recorder();
          drawDoctorBust(r.ctx, spec, pose({ mood, talking, talk: talking ? 0.8 : 0 }), 2.3);
          expect(r.log.length, `${spec.id} ${mood}`).toBeGreaterThan(100);
          for (const [x, y] of r.pts) {
            expect(Math.min(x, y), `${spec.id} ${mood}`).toBeGreaterThanOrEqual(-1);
            expect(Math.max(x, y), `${spec.id} ${mood}`).toBeLessThanOrEqual(101);
          }
        }
  });

  it('look different in each mood (faces change, not only labels)', () => {
    for (const spec of specs) {
      const logs = DOCTOR_MOODS.map((mood) => {
        const r = recorder();
        drawDoctorBust(r.ctx, spec, pose({ mood, gesture: 'rest' }), 0);
        return r.log.join('|');
      });
      expect(new Set(logs).size, spec.id).toBe(DOCTOR_MOODS.length);
    }
  });

  it('are deterministic and hold still under Reduce motion', () => {
    const a = recorder();
    const b = recorder();
    drawDoctorAt(a.ctx, ALBOR, pose({ mood: 'happy', gesture: 'wave' }), 3.7, 50, 100, 1);
    drawDoctorAt(b.ctx, ALBOR, pose({ mood: 'happy', gesture: 'wave' }), 3.7, 50, 100, 1);
    expect(a.log).toEqual(b.log);
    const c = recorder();
    const d = recorder();
    drawDoctorAt(c.ctx, playerSpec('beanie'), pose({ reduceMotion: true, gesture: 'walk', item: 'suitcase' }), 1, 50, 100, 1);
    drawDoctorAt(d.ctx, playerSpec('beanie'), pose({ reduceMotion: true, gesture: 'walk', item: 'suitcase' }), 9.4, 50, 100, 1);
    expect(c.log).toEqual(d.log);
  });

  it('breathe and blink when motion is allowed', () => {
    const a = recorder();
    const b = recorder();
    drawDoctorBust(a.ctx, ALBOR, pose(), 0.2);
    drawDoctorBust(b.ctx, ALBOR, pose(), 1.1);
    expect(a.log).not.toEqual(b.log);
    const open = recorder();
    const shut = recorder();
    drawDoctorBust(open.ctx, ALBOR, pose({ blink: 0 }), 1);
    drawDoctorBust(shut.ctx, ALBOR, pose({ blink: 1 }), 1);
    expect(open.log).not.toEqual(shut.log);
  });

  it('draw every gesture with every held item without errors', () => {
    const gestures: Gesture[] = ['rest', 'wave', 'chin', 'cheeks', 'hips', 'clasp', 'hold', 'point', 'write', 'walk'];
    for (const g of gestures)
      for (const item of ['none', 'lantern', 'clipboard', 'notebook', 'mug', 'suitcase'] as const) {
        const r = recorder();
        drawDoctorAt(r.ctx, ALBOR, pose({ gesture: g, item }), 1.5, 0, 0, 1);
        expect(r.log.length).toBeGreaterThan(50);
      }
  });

  it('map the story moods onto doctor faces (awed reads as surprised)', () => {
    expect(doctorMood('awed')).toBe('surprised');
    expect(doctorMood('thinking')).toBe('thinking');
    expect(doctorMood('whatever')).toBe('neutral');
  });

  it('show up as the dialogue speakers albor (tape and live) and you, with a thinking face for VELA too', () => {
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
    for (const s of [st({}), st({ live: true }), st({ speaker: 'you' }), st({ speaker: 'you', mood: 'thinking' }), st({ speaker: 'vela', mood: 'thinking' })]) {
      const r = recorder();
      drawPortrait(r.ctx, s, 1.2, null);
      expect(r.log.length).toBeGreaterThan(60);
    }
  });
});

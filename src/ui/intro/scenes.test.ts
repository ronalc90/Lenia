import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntroSceneId } from '../../story/introScript';

/** Switches the archive photos on (a fake loaded image) or off (photos blocked, the default in Node). */
const photoState = vi.hoisted(() => ({ on: false }));
vi.mock('../art/photos', async (orig) => {
  const real = await orig<typeof import('../art/photos')>();
  const img = { width: 900, height: 600, naturalWidth: 900, naturalHeight: 600 };
  return { ...real, peekPhoto: () => (photoState.on ? (img as unknown as HTMLImageElement) : null) };
});

const { HERO_TIME, SCENE_PAINTERS, paintScene } = await import('./scenes');
const { coverCrop, cropToScreen, kenBurns } = await import('./photofx');

/**
 * A recording 2D context: logs every call and property write (numbers rounded), the text it writes, and
 * throws on a non-finite number, so tests can check a scene is drawable, deterministic and filter-free.
 */
function recorder() {
  const log: string[] = [];
  const texts: string[] = [];
  const grad = { addColorStop: (o: number) => void (Number.isFinite(o) || (() => { throw new Error('stop'); })()) };
  const impl: Record<string, (...a: unknown[]) => unknown> = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createConicGradient: () => grad,
    createPattern: () => null,
    measureText: (s) => ({ width: String(s).length * 7 }),
    fillText: (s) => void texts.push(String(s)),
  };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key}(${args.join(',')}) got a non-finite number`);
        log.push(`${key}(${args.map((a) => (typeof a === 'number' ? a.toFixed(2) : typeof a === 'string' ? a : typeof a)).join(',')})`);
        return impl[key]?.(...args);
      };
    },
    set(t, key: string, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${key} = ${v}`);
      log.push(`${key}=${typeof v === 'number' ? v.toFixed(3) : typeof v === 'object' ? 'obj' : String(v)}`);
      t[key] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, texts };
}

const IDS = Object.keys(SCENE_PAINTERS) as IntroSceneId[];
const PHONE = { w: 390, h: 490, dpr: 2 };
const DESKTOP = { w: 830, h: 728, dpr: 1 };

function paint(id: IntroSceneId, size: { w: number; h: number; dpr: number }, t: number, rm = false, lang: 'es' | 'en' = 'es') {
  const r = recorder();
  paintScene(r.ctx, id, { ...size, t, rm, look: 'curls', lang });
  return r;
}

afterEach(() => {
  photoState.on = false;
});

describe('intro scenes as a realistic lab night (docs/ARTE-REALISTA.md §6.6)', () => {
  it('every panel draws on a phone and a laptop, with the photos blocked and with them loaded', () => {
    for (const on of [false, true]) {
      photoState.on = on;
      for (const id of IDS)
        for (const size of [PHONE, DESKTOP])
          for (const t of [0, 0.7, HERO_TIME[id], 7.3]) expect(() => paint(id, size, t), `${id} ${size.w}×${size.h} t=${t} photos=${on}`).not.toThrow();
    }
  });

  it('draws something in every panel without the photos (the vector fallback)', () => {
    for (const id of IDS) {
      const { log } = paint(id, PHONE, HERO_TIME[id]);
      expect(log.filter((l) => /^(fill|stroke|fillRect|strokeRect|fillText|drawImage)\(/.test(l)).length, id).toBeGreaterThan(15);
    }
  });

  it('uses the photo when it has loaded (the station is the archive photo, not the vector one)', () => {
    photoState.on = true;
    const withPhoto = paint('station', DESKTOP, 1).log;
    photoState.on = false;
    const without = paint('station', DESKTOP, 1).log;
    expect(withPhoto.some((l) => l.startsWith('drawImage(object'))).toBe(true);
    expect(withPhoto.join('\n')).not.toBe(without.join('\n'));
  });

  it('is deterministic: the same time gives the same frame', () => {
    for (const id of IDS) expect(paint(id, PHONE, 1.9).log.join('\n'), id).toBe(paint(id, PHONE, 1.9).log.join('\n'));
  });

  it('holds still under Reduce motion: any time shows the finished panel', () => {
    for (const id of IDS) expect(paint(id, DESKTOP, 0.2, true).log.join('\n'), id).toBe(paint(id, DESKTOP, 9.7, true).log.join('\n'));
  });

  it('never uses ctx.filter or shadowBlur (Safari has no filter; no blur in the loop)', () => {
    photoState.on = true;
    for (const id of IDS) {
      const { log } = paint(id, PHONE, HERO_TIME[id]);
      expect(log.some((l) => l.startsWith('filter=') || l.startsWith('shadowBlur=')), id).toBe(false);
    }
  });

  it('labels the plates in the player’s language, with a scale bar', () => {
    const es = paint('sow', PHONE, 2.5, false, 'es').texts;
    const en = paint('sow', PHONE, 2.5, false, 'en').texts;
    expect(es).toContain('criatura');
    expect(en).toContain('creature');
    expect(es).toContain('10 mm');
    expect(paint('essence', DESKTOP, 2.2).texts).toContain('5 mm');
  });

  it('the coat you pick comes off its hook and your hand enters the frame (the arrive panel moves with the pick)', () => {
    const at = (pickAge: number) => {
      const r = recorder();
      paintScene(r.ctx, 'arrive', { ...PHONE, t: 5, rm: false, look: 'beanie', lang: 'es', pickAge });
      return r.log.join('\n');
    };
    expect(at(0)).not.toBe(at(0.3));
    expect(at(3)).toBe(at(3));
  });

  it('QA-CLARIDAD-2 C2: Fig. 3 converts light at the game’s rate (25 luz = 1 Dato), never «LUZ 12 → DATOS +12»', async () => {
    const { DATOS_ESSENCE_DIV } = await import('../../game/cycleBalance');
    /** The two readings of panel b: «+N» Datos, and the light: the last plain number drawn before it. */
    const read = (t: number, rm = false) => {
      const tx = paint('clock', PHONE, t, rm).texts;
      const j = tx.findIndex((x) => /^\+\d+$/.test(x));
      const luz = tx.slice(0, j).filter((x) => /^\d+$/.test(x)).pop();
      return { luz: Number(luz), datos: Number(tx[j].slice(1)) };
    };
    const luz0 = read(0).luz;
    expect(luz0).toBeGreaterThanOrEqual(DATOS_ESSENCE_DIV);
    // The finished panel: all the light became Datos, 25 to 1.
    expect(read(0, true)).toEqual({ luz: 0, datos: Math.floor(luz0 / DATOS_ESSENCE_DIV) });
    // Every frame on the way: the Datos shown never exceed the light spent ÷ 25.
    for (let t = 2.4; t <= 4; t += 0.05) {
      const r = read(t);
      expect(r.datos * DATOS_ESSENCE_DIV).toBeLessThanOrEqual(luz0 - r.luz);
    }
  });

  it('QA-CLARIDAD-2 §2e: Fig. 4 shows the Tree’s 8 routes, without «24°» or «raíz»', () => {
    const tx = paint('tree', PHONE, 5).texts.join(' | ');
    expect(tx).toMatch(/8 rutas/);
    expect(tx).not.toMatch(/7 rutas|24°|raíz/);
  });

  it('the dish carries its true size: Ø 90 mm (Ø128 cells at 0.7 mm per cell)', () => {
    expect(paint('dish', PHONE, 2.6).texts).toContain('Ø 90 mm');
  });
});

describe('photo compositing', () => {
  it('a cover crop fills the box without bars and keeps inside the image', () => {
    for (const [iw, ih, w, h] of [
      [900, 596, 390, 490],
      [900, 596, 830, 728],
      [640, 960, 300, 200],
    ]) {
      for (const fx of [0, 0.3, 1]) {
        const c = coverCrop(iw, ih, w, h, fx, 0.5, 1.04);
        expect(c.sw / c.sh).toBeCloseTo(w / h, 5);
        expect(c.sx).toBeGreaterThanOrEqual(0);
        expect(c.sy).toBeGreaterThanOrEqual(0);
        expect(c.sx + c.sw).toBeLessThanOrEqual(iw + 1e-9);
        expect(c.sy + c.sh).toBeLessThanOrEqual(ih + 1e-9);
      }
    }
  });

  it('maps an image point to the screen through the crop', () => {
    const c = coverCrop(900, 600, 450, 300);
    expect(cropToScreen(c, 0, 0, 450, 300, 450, 300)).toEqual([225, 150]);
  });

  it('the Ken Burns push-in goes from 1 to 1.04 in 4 s, and holds its end framing under Reduce motion', () => {
    expect(kenBurns(0, 4, 1.04, false)).toBe(1);
    expect(kenBurns(4, 4, 1.04, false)).toBeCloseTo(1.04, 9);
    expect(kenBurns(9, 4, 1.04, false)).toBeCloseTo(1.04, 9);
    expect(kenBurns(0, 4, 1.04, true)).toBe(1.04);
  });
});

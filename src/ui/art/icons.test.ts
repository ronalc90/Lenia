import { describe, expect, it } from 'vitest';
import { TREE_NODES } from '../../game/tree';
import { WORLDS } from '../../game/worlds';
import { ICONS, ICON_GROUPS, ROUTE_ICON, STROKE, WORLD_ICON, artIcon, hasIcon, hasTreeIcon, icon, moIcon, resolveIcon, sicon, treeIcon } from './icons';

/** Every name the four legacy icon modules accept (src/ui/icons.ts, tree/icons.ts, moments/icons.ts, store/icons.ts). */
const LEGACY = {
  ui: 'textsize broom hanger bag essence samples genome journal settings sound mute pause play speed eraser lab bestiary calibrate lock check close plus print pencil follow trophy moon sparkle warning info chevronUp chevronDown chevronRight trash copy download upload camera target rebirth seed stats globe vibrate motion hand layers shield heart contrast bolt still pulsing swimmer spinner divider colony unknown',
  tree: 'lab datos question lock moon check close plus minus centre play tree clockIcon drop species behavior encargo star gift snow sprintIcon trophy clock clock2 encTime sprint clock3 clock4 dropper startEssence freeSeeds bigSeed stabilizer cheapSeeds dropperMax fridge autoSeeder dish slots nursery crowdCost incubator dishXL ecosystem culture nutrient swimAffinity sessileAffinity culture2 abundance colonyAffinity eternalLife symbiosis notebook print cataloguing microscope archive discoBonus mutations rareSpores encyclopedia world worldGyro worldCold worldLegs worldShields worldHelix worldGiants spark sparkLife sparkGift sparkDatos sparkFirst sparkMutagen sparkTime',
  mo: 'drop fade burst heart essence book behavior split spark upgrade robot sliders tag genome moon sample clock up down x check gift slot creatures info big close pause eye warn lock still pulsing swimmer spinner divider colony',
  store: 'bag hanger palette dish sparkle music user heart check close back lock play stop restore shield clock journal name crown info external halo seed gift trophy',
};

// ── A tiny SVG geometry reader: every anchor / control point / circle extent of an icon. ──
type Pt = [number, number];

function pathPoints(d: string): Pt[] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(toks[i++]);
  const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const lc = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    if (lc === 'z') {
      x = sx;
      y = sy;
      continue;
    }
    const n = ARGS[lc];
    if (n === undefined) throw new Error(`bad command ${cmd}`);
    const a = Array.from({ length: n }, num);
    if (a.some((v) => !Number.isFinite(v))) throw new Error(`NaN in path: ${d}`);
    const P = (px: number, py: number): Pt => (rel ? [x + px, y + py] : [px, py]);
    if (lc === 'h') {
      x = rel ? x + a[0] : a[0];
      pts.push([x, y]);
    } else if (lc === 'v') {
      y = rel ? y + a[0] : a[0];
      pts.push([x, y]);
    } else if (lc === 'a') {
      const e = P(a[5], a[6]);
      // The arc can bulge up to its radius beyond the chord: include the arc's centre-ish extent.
      pts.push(e);
      x = e[0];
      y = e[1];
    } else {
      for (let k = 0; k < n; k += 2) pts.push(P(a[k], a[k + 1]));
      const e = pts[pts.length - 1];
      x = e[0];
      y = e[1];
    }
    if (lc === 'm') {
      sx = x;
      sy = y;
      if (cmd === 'm') cmd = 'l';
      else if (cmd === 'M') cmd = 'L';
    }
  }
  return pts;
}

function attr(tag: string, name: string): number | null {
  const m = tag.match(new RegExp(`\\s${name}="(-?[\\d.]+)"`));
  return m ? Number(m[1]) : null;
}

function iconExtent(markup: string): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const add = (v: number) => {
    min = Math.min(min, v);
    max = Math.max(max, v);
  };
  for (const tag of markup.match(/<(path|circle|ellipse|rect)\b[^>]*>/g) ?? []) {
    if (tag.includes('transform=')) continue; // rotated petals: checked by their centre/radius below
    if (tag.startsWith('<path')) {
      const d = tag.match(/\sd="([^"]+)"/)![1];
      for (const [px, py] of pathPoints(d)) {
        add(px);
        add(py);
      }
    } else if (tag.startsWith('<circle')) {
      const cx = attr(tag, 'cx')!;
      const cy = attr(tag, 'cy')!;
      const r = attr(tag, 'r')!;
      add(cx - r);
      add(cx + r);
      add(cy - r);
      add(cy + r);
    } else if (tag.startsWith('<ellipse')) {
      const cx = attr(tag, 'cx')!;
      const cy = attr(tag, 'cy')!;
      add(cx - attr(tag, 'rx')!);
      add(cx + attr(tag, 'rx')!);
      add(cy - attr(tag, 'ry')!);
      add(cy + attr(tag, 'ry')!);
    } else {
      const x0 = attr(tag, 'x')!;
      const y0 = attr(tag, 'y')!;
      add(x0);
      add(y0);
      add(x0 + attr(tag, 'width')!);
      add(y0 + attr(tag, 'height')!);
    }
  }
  return { min, max };
}

describe('icon set v2', () => {
  it('gives every research-tree node its own icon, and it is never the "?" fallback', () => {
    for (const n of TREE_NODES) {
      expect(hasTreeIcon(n.icon), n.id).toBe(true);
      expect(resolveIcon(n.icon, 'tree'), n.id).not.toBe('question');
    }
    expect(new Set(TREE_NODES.map((n) => resolveIcon(n.icon, 'tree'))).size).toBe(TREE_NODES.length);
  });

  it('accepts every name the old icon modules accepted (drop-in swap)', () => {
    for (const [api, list] of Object.entries(LEGACY) as [keyof typeof LEGACY, string][])
      for (const nm of list.split(' ')) {
        if (nm === 'question' || nm === 'unknown') continue;
        expect(resolveIcon(nm, api), `${api}:${nm}`).not.toBe('question');
      }
  });

  it('has an icon for every route, world and behaviour', () => {
    for (const v of Object.values(ROUTE_ICON)) expect(hasIcon(v), v).toBe(true);
    for (const w of WORLDS) expect(hasIcon(WORLD_ICON[w.id]), w.id).toBe(true);
    for (const b of ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony']) expect(hasIcon(b), b).toBe(true);
    for (const names of Object.values(ICON_GROUPS)) for (const nm of names) expect(hasIcon(nm), nm).toBe(true);
  });

  it('measures artwork extents (the grid check can fail)', () => {
    expect(iconExtent('<circle cx="12" cy="12" r="12"/>')).toEqual({ min: 0, max: 24 });
    expect(iconExtent('<path d="M2 3l4 5h-1v-2z"/>')).toEqual({ min: 2, max: 8 });
  });

  it('keeps all artwork on the 24 grid inside the safe margin', () => {
    for (const [name, def] of Object.entries(ICONS)) {
      const { min, max } = iconExtent(def.s + (def.f ? `<path d="${def.f}"/>` : ''));
      expect(min, `${name} min`).toBeGreaterThanOrEqual(1.25);
      expect(max, `${name} max`).toBeLessThanOrEqual(22.75);
    }
  });

  it('draws with one stroke weight and lets CSS colour it', () => {
    for (const [name, def] of Object.entries(ICONS)) {
      expect(def.s.includes('stroke-width'), name).toBe(false);
      expect(/#[0-9a-f]{3,6}\b/i.test(def.s + (def.f ?? '')), `${name} hard-codes a colour`).toBe(false);
    }
    const svg = artIcon('essence', 24);
    expect(svg).toContain(`stroke-width="${STROKE}"`);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toMatch(/aria-hidden="true"/);
  });

  it('keeps the legacy class names so module CSS still applies', () => {
    expect(icon('settings')).toMatch(/class="bl-ic ic"/);
    expect(treeIcon('clock', 24, 'x')).toMatch(/class="bl-ic rt-ic x"/);
    expect(moIcon('drop', 20)).toMatch(/class="bl-ic mo-ic"/);
    expect(sicon('bag', 24, 'data-x="1"')).toMatch(/class="bl-ic bst-ic" .*data-x="1"/);
    expect(treeIcon('nope')).toBe(treeIcon('question'));
  });
});

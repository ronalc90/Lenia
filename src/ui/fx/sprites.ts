/**
 * Pre-rendered light sprites (docs/ARTE-PULIDO.md A-10, P4): a glow disc, a four-point star (the
 * Destello's shape), the Esencia drop and a lens bokeh, drawn once per colour and blitted with
 * drawImage at integer coordinates. No shadowBlur, no gradients or rgba() strings per frame: opacity
 * is globalAlpha.
 */

export const SPR = { disc: 0, star: 1, drop: 2, bokeh: 3 } as const;
export type SpriteId = (typeof SPR)[keyof typeof SPR];

/** Cell size of one sprite (px): large halos stay smooth when scaled up. */
const CELL = 64;
/** Colours kept at once (species hues + a few UI colours); the oldest is redrawn past it. */
const MAX_COLORS = 40;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** One colour's four sprites side by side. */
function paintRow(hex: string): HTMLCanvasElement {
  const c = makeCanvas(CELL * 4, CELL);
  const ctx = c.getContext('2d')!;
  const [r, g, b] = rgb(hex);
  const hot = `rgb(${Math.round(r + (255 - r) * 0.7)},${Math.round(g + (255 - g) * 0.7)},${Math.round(b + (255 - b) * 0.7)})`;
  const col = (a: number) => `rgba(${r},${g},${b},${a})`;
  const h = CELL / 2;
  // 0. Glow disc: a hot core, the colour, a long soft falloff.
  {
    const gr = ctx.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, hot);
    gr.addColorStop(0.12, col(0.95));
    gr.addColorStop(0.35, col(0.45));
    gr.addColorStop(0.7, col(0.1));
    gr.addColorStop(1, col(0));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, CELL, CELL);
  }
  // 1. Four-point star (concave, ARTE §5) over a faint glow.
  {
    const x0 = CELL;
    const gr = ctx.createRadialGradient(x0 + h, h, 0, x0 + h, h, h);
    gr.addColorStop(0, col(0.5));
    gr.addColorStop(0.5, col(0.12));
    gr.addColorStop(1, col(0));
    ctx.fillStyle = gr;
    ctx.fillRect(x0, 0, CELL, CELL);
    const s = h * 0.92;
    const k = h * 0.1;
    ctx.beginPath();
    ctx.moveTo(x0 + h, h - s);
    ctx.quadraticCurveTo(x0 + h + k, h - k, x0 + h + s, h);
    ctx.quadraticCurveTo(x0 + h + k, h + k, x0 + h, h + s);
    ctx.quadraticCurveTo(x0 + h - k, h + k, x0 + h - s, h);
    ctx.quadraticCurveTo(x0 + h - k, h - k, x0 + h, h - s);
    const sg = ctx.createRadialGradient(x0 + h, h, 0, x0 + h, h, s);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.25, hot);
    sg.addColorStop(1, col(0.85));
    ctx.fillStyle = sg;
    ctx.fill();
  }
  // 2. Esencia drop (the HUD's shape): round body, pointed top, a highlight low on the left.
  {
    const x0 = CELL * 2;
    const R = CELL * 0.26;
    const cx = x0 + h;
    const cy = h + R * 0.45;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, h);
    gr.addColorStop(0, col(0.35));
    gr.addColorStop(1, col(0));
    ctx.fillStyle = gr;
    ctx.fillRect(x0, 0, CELL, CELL);
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 2.1);
    ctx.bezierCurveTo(cx + R * 0.95, cy - R * 0.9, cx + R, cy - R * 0.35, cx + R, cy);
    ctx.arc(cx, cy, R, 0, Math.PI);
    ctx.bezierCurveTo(cx - R, cy - R * 0.35, cx - R * 0.95, cy - R * 0.9, cx, cy - R * 2.1);
    const dg = ctx.createLinearGradient(cx, cy - R * 2, cx, cy + R);
    dg.addColorStop(0, hot);
    dg.addColorStop(1, col(1));
    ctx.fillStyle = dg;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(cx - R * 0.38, cy + R * 0.2, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  // 3. Bokeh: an out-of-focus disc, flat inside with a slightly brighter rim.
  {
    const x0 = CELL * 3;
    const gr = ctx.createRadialGradient(x0 + h, h, 0, x0 + h, h, h * 0.92);
    gr.addColorStop(0, col(0.55));
    gr.addColorStop(0.78, col(0.7));
    gr.addColorStop(0.9, col(0.85));
    gr.addColorStop(1, col(0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x0 + h, h, h * 0.92, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export class SpriteAtlas {
  private rows: HTMLCanvasElement[] = [];
  private hexes: string[] = [];
  private index = new Map<string, number>();
  private next = 0;

  /** Index of a colour's sprites ('#RRGGBB'), painted on first use (not in a frame's hot path). */
  color(hex: string): number {
    const key = hex.toLowerCase();
    const i = this.index.get(key);
    if (i !== undefined) return i;
    let k: number;
    if (this.rows.length < MAX_COLORS) {
      k = this.rows.length;
      this.rows.push(paintRow(key));
      this.hexes.push(key);
    } else {
      k = this.next;
      this.next = (this.next + 1) % MAX_COLORS;
      this.index.delete(this.hexes[k]);
      this.rows[k] = paintRow(key);
      this.hexes[k] = key;
    }
    this.index.set(key, k);
    return k;
  }

  /** Blit a sprite centred on (x, y), `size` px across, at `alpha` (the caller sets the blend mode). */
  draw(ctx: CanvasRenderingContext2D, sprite: number, color: number, x: number, y: number, size: number, alpha: number): void {
    const row = this.rows[color];
    if (!row || !(size > 0.3) || !(alpha > 0.004)) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    const half = size / 2;
    ctx.drawImage(row, sprite * CELL, 0, CELL, CELL, Math.round(x - half), Math.round(y - half), size, size);
  }

  /** Same, squashed: sx, sy scale the sprite's width and height (the seed drop's squash). */
  drawScaled(ctx: CanvasRenderingContext2D, sprite: number, color: number, x: number, y: number, w: number, h: number, alpha: number): void {
    const row = this.rows[color];
    if (!row || !(w > 0.3) || !(h > 0.3) || !(alpha > 0.004)) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(row, sprite * CELL, 0, CELL, CELL, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }
}

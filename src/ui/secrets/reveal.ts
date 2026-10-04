/**
 * "Secreto descubierto": the reveal card. A reticle seal draws the secret's glyph (or, for a
 * hidden species, its live catalog portrait in the secret's colormap), the name writes itself
 * letter by letter, then the cryptic flavour line and the (tiny) reward. Tap to dismiss;
 * reveals queue up one after another. Respects reduceMotion (instant, no spin).
 */
import type { Lang, Text } from '../../core/types';
import { BONUS_CAP, BONUS_PER_SECRET, COLORMAPS, colormapColor } from '../../secrets/data';
import type { CosmeticId, MoteHue, SecretView } from '../../secrets/types';
import { catalogPattern } from '../../sim/catalog';
import { glyphSVG, sealRingSVG } from './glyphs';

export interface RevealItem {
  secret: SecretView;
  index: number;
  total: number;
  /** The final "all found" card. */
  all?: boolean;
}

const T = {
  kicker: { es: 'Secreto descubierto', en: 'Secret discovered' },
  kickerSpecies: { es: 'Especie oculta', en: 'Hidden species' },
  kickerAll: { es: 'Todos los secretos', en: 'Every secret' },
  bonus: { es: '+1 % Esencia', en: '+1% Essence' },
  bonusMax: { es: 'Bonus máximo alcanzado', en: 'Bonus maxed' },
  palette: { es: 'Paleta', en: 'Palette' },
  allName: { es: 'Nada más que encontrar', en: 'Nothing left to find' },
  allFlavor: { es: 'Ya no queda nada escondido. O eso creo.', en: 'Nothing is hidden any more. Or so I think.' },
} satisfies Record<string, Text>;

/** Accent class + burst hue per secret. */
function accent(s: SecretView): { cls: string; hue: MoteHue } {
  if (s.id === 'ignis') return { cls: 'c-ember', hue: 'ember' };
  if (s.id === 'phantasma') return { cls: 'c-silver', hue: 'silver' };
  if (s.id === 'cryptid') return { cls: 'c-violet', hue: 'violet' };
  return { cls: '', hue: 'gold' };
}

/** CSS gradient of a colormap (swatches). */
export function colormapCSS(id: CosmeticId): string {
  const stops = COLORMAPS[id].stops;
  const parts: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const v = 0.12 + (i / 8) * 0.88;
    const [r, g, b] = colormapColor(stops, v);
    parts.push(`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)}) ${(i / 8) * 100}%`);
  }
  return `linear-gradient(90deg,${parts.join(',')})`;
}

/** Catalog portrait drawn with a colormap (hidden species). */
function portrait(code: string, cm: CosmeticId | null, size = 156): HTMLCanvasElement | null {
  let p;
  try {
    p = catalogPattern(code);
  } catch {
    return null;
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(size, size);
  const stops = COLORMAPS[cm ?? 'aurora'].stops;
  const scale = Math.max(p.w, p.h) / (size * 0.86);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = p.w / 2 + (x + 0.5 - size / 2) * scale;
      const py = p.h / 2 + (y + 0.5 - size / 2) * scale;
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= p.w || yy >= p.h ? 0 : p.data[yy * p.w + xx]);
      const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
      const [r, g, b, a] = colormapColor(stops, v);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface RevealDeps {
  host: HTMLElement;
  lang: () => Lang;
  reduceMotion: () => boolean;
  /** Called when a card appears (screen centre of the seal), for the mote burst and the sound. */
  onShow?: (item: RevealItem, seal: { x: number; y: number }, hue: MoteHue) => void;
}

export class RevealQueue {
  private queue: RevealItem[] = [];
  private current: { el: HTMLElement; timer: number } | null = null;

  constructor(private d: RevealDeps) {}

  push(item: RevealItem): void {
    this.queue.push(item);
    if (!this.current) this.next();
  }

  /** Dismiss the visible card (the next one follows). */
  dismiss(): void {
    const c = this.current;
    if (!c) return;
    clearTimeout(c.timer);
    c.el.classList.add('out');
    const done = () => {
      c.el.remove();
      if (this.current === c) {
        this.current = null;
        this.next();
      }
    };
    if (this.d.reduceMotion()) done();
    else setTimeout(done, 480);
  }

  get visible(): boolean {
    return this.current !== null;
  }

  dispose(): void {
    if (this.current) {
      clearTimeout(this.current.timer);
      this.current.el.remove();
    }
    this.current = null;
    this.queue = [];
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) return;
    const el = this.build(item);
    this.d.host.appendChild(el);
    const species = item.secret.category === 'species';
    const hold = (item.all ? 9 : species ? 8 : 6.5) * 1000;
    const timer = window.setTimeout(() => this.dismiss(), hold);
    this.current = { el, timer };
    el.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    requestAnimationFrame(() => {
      const seal = el.querySelector('.bls-seal');
      const r = seal?.getBoundingClientRect();
      const hr = this.d.host.getBoundingClientRect();
      this.d.onShow?.(item, r ? { x: r.left + r.width / 2 - hr.left, y: r.top + r.height / 2 - hr.top } : { x: hr.width / 2, y: 80 }, item.all ? 'gold' : accent(item.secret).hue);
    });
  }

  private build(item: RevealItem): HTMLElement {
    const l = this.d.lang();
    const s = item.secret;
    const species = s.category === 'species';
    const el = document.createElement('div');
    el.className = `bls-reveal ${item.all ? 'c-all' : accent(s).cls}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    const seal = document.createElement('div');
    seal.className = 'bls-seal';
    seal.innerHTML = sealRingSVG(112);
    if (species && s.code && !item.all) {
      const cv = portrait(s.code, s.cosmetic);
      if (cv) seal.appendChild(cv);
      else seal.insertAdjacentHTML('beforeend', glyphSVG(s.glyph, 54));
    } else {
      seal.insertAdjacentHTML('beforeend', glyphSVG(item.all ? 'sparks' : s.glyph, 54));
      // Stagger the strokes of multi-part glyphs.
      seal.querySelectorAll<SVGElement>('.g').forEach((g, i) => (g.style.animationDelay = `${0.15 + i * 0.12}s`));
    }

    const kicker = document.createElement('div');
    kicker.className = 'bls-kicker';
    kicker.textContent = (item.all ? T.kickerAll : species ? T.kickerSpecies : T.kicker)[l];
    if (!item.all) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = ` · ${item.index}/${item.total}`;
      kicker.appendChild(n);
    }

    const name = document.createElement('div');
    name.className = 'bls-name';
    const nameText = item.all ? T.allName[l] : s.name[l];
    name.setAttribute('aria-label', nameText);
    [...nameText].forEach((ch, i) => {
      const sp = document.createElement('span');
      sp.className = 'l';
      sp.setAttribute('aria-hidden', 'true');
      sp.textContent = ch === ' ' ? ' ' : ch;
      sp.style.animationDelay = `${0.45 + i * 0.035}s`;
      name.appendChild(sp);
    });

    el.append(seal, kicker, name);
    if (species && s.latin && !item.all) {
      const lat = document.createElement('div');
      lat.className = 'bls-latin';
      lat.textContent = s.latin;
      el.appendChild(lat);
    }
    const flavor = document.createElement('div');
    flavor.className = 'bls-flavor';
    flavor.textContent = item.all ? T.allFlavor[l] : s.flavor[l];
    el.appendChild(flavor);

    const reward = document.createElement('div');
    reward.className = 'bls-reward';
    if (!item.all) {
      const capped = item.index * BONUS_PER_SECRET > BONUS_CAP + 1e-9;
      const b = document.createElement('span');
      b.className = 'bls-chip gold';
      b.textContent = (capped ? T.bonusMax : T.bonus)[l];
      reward.appendChild(b);
    }
    const cm: CosmeticId | null = item.all ? 'gilded' : s.cosmetic;
    if (cm) {
      const c = document.createElement('span');
      c.className = 'bls-chip';
      const sw = document.createElement('span');
      sw.className = 'sw';
      sw.style.background = colormapCSS(cm);
      c.append(sw, `${T.palette[l]} «${COLORMAPS[cm].name[l]}»`);
      reward.appendChild(c);
    }
    if (reward.childElementCount) el.appendChild(reward);
    return el;
  }
}

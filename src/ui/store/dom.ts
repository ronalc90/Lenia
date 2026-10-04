/**
 * Small DOM helpers and shared visual bits for the store UI (independent of src/ui/dom.ts so this
 * folder can ship before/without the main UI changes).
 */
import type { Lang } from '../../core/types';
import type { BadgeData, FrameData, NameColorData, PaletteData } from '../../store/catalog';
import { paletteCss } from '../../store/apply';
import { sicon, svgInner } from './icons';

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
export type Kid = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = String(v);
      else if (k === 'html') e.innerHTML = String(v);
      else if (k === 'text') e.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

export function iconEl(name: string, size = 20, cls = ''): HTMLSpanElement {
  return el('span', { class: `bst-icw ${cls}`, html: sicon(name, size) });
}

/** Round palette swatch (conic of the palette's opaque range). */
export function swatch(p: PaletteData, size = 22): HTMLSpanElement {
  const s = el('span', { class: 'bst-swatch' });
  s.style.width = s.style.height = `${size}px`;
  s.style.background = paletteCss(p.stops, '135deg');
  return s;
}

/** Ranking name plate: frame + badge + coloured name + tag. */
export function namePlate(name: string, tag: string, badge: BadgeData, frame: FrameData, color: NameColorData, compact = false): HTMLDivElement {
  const plate = el('div', { class: `bst-plate frame-${frame.style}${compact ? ' compact' : ''}` });
  if (frame.style === 'gradient' && frame.colors.length) {
    plate.style.setProperty('--frame', `linear-gradient(120deg, ${frame.colors.join(', ')})`);
  } else if (frame.colors[0]) {
    plate.style.setProperty('--frame', frame.colors[0]);
    plate.style.setProperty('--frame2', frame.colors[1] ?? frame.colors[0]);
  }
  if (frame.glow) plate.style.setProperty('--frame-glow', frame.glow);
  if (badge.svg) {
    const b = el('span', { class: 'bst-badge', html: svgInner(badge.svg, compact ? 16 : 18) });
    b.style.color = badge.color;
    b.style.background = badge.bg;
    plate.append(b);
  }
  const n = el('span', { class: 'bst-plate-name', text: name });
  if (color.gradient) {
    n.style.backgroundImage = `linear-gradient(90deg, ${color.gradient[0]}, ${color.gradient[1]})`;
    n.classList.add('grad');
  } else n.style.color = color.color;
  plate.append(n, el('span', { class: 'bst-plate-tag', text: `#${tag}` }));
  return plate;
}

export interface Toaster {
  show(text: string, kind?: 'good' | 'info' | 'warn'): void;
  el: HTMLElement;
}

export function toaster(): Toaster {
  const box = el('div', { class: 'bst-toast', role: 'status', 'aria-live': 'polite' });
  let timer = 0;
  return {
    el: box,
    show(text, kind = 'info') {
      box.textContent = text;
      box.dataset.kind = kind;
      box.classList.remove('on');
      void box.offsetWidth;
      box.classList.add('on');
      clearTimeout(timer);
      timer = window.setTimeout(() => box.classList.remove('on'), 2800);
    },
  };
}

/** Injects the store stylesheet once (Vite inlines the CSS via ?inline import in modal.ts). */
let styled = false;
export function ensureStyles(css: string): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.dataset.bioluma = 'store';
  s.textContent = css;
  document.head.appendChild(s);
}

export const isLang = (l: string): l is Lang => l === 'es' || l === 'en';

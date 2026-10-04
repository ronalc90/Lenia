/**
 * Tiny DOM helpers. The UI is updated ~10×/s, so every setter is a no-op when
 * the value did not change (no layout thrash, no lost focus/scroll).
 */
import { icon } from './icons';

export type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'style' && typeof v === 'string') el.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** An icon as an element (span wrapper so it can be sized/coloured via CSS). */
export function ic(name: string, size = 24, cls = ''): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'icw ' + cls;
  s.innerHTML = icon(name, size);
  return s;
}

const TEXT = Symbol('text');
const HTML = Symbol('html');
type Cached = Element & { [TEXT]?: string; [HTML]?: string };

export function setText(el: Element, s: string): void {
  const c = el as Cached;
  if (c[TEXT] === s) return;
  c[TEXT] = s;
  el.textContent = s;
}

export function setHTML(el: Element, s: string): void {
  const c = el as Cached;
  if (c[HTML] === s) return;
  c[HTML] = s;
  el.innerHTML = s;
}

export function toggle(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function show(el: HTMLElement, on: boolean): void {
  if (el.hidden === !on) return;
  el.hidden = !on;
}

export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function setStyle(el: HTMLElement, prop: string, value: string): void {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

export function setDisabled(el: HTMLButtonElement | HTMLInputElement, d: boolean): void {
  if (el.disabled !== d) el.disabled = d;
}

/** Keep `container`'s children in the order/key set of `items`, reusing rows. */
export function reconcile<T, R extends { el: HTMLElement }>(
  container: HTMLElement,
  items: T[],
  key: (item: T) => string,
  cache: Map<string, R>,
  create: (item: T) => R,
  update: (row: R, item: T) => void,
): void {
  const seen = new Set<string>();
  let ref: ChildNode | null = container.firstChild;
  for (const item of items) {
    const k = key(item);
    seen.add(k);
    let row = cache.get(k);
    if (!row) {
      row = create(item);
      cache.set(k, row);
    }
    update(row, item);
    if (row.el !== ref) container.insertBefore(row.el, ref);
    else ref = ref.nextSibling;
  }
  for (const [k, row] of cache) {
    if (!seen.has(k)) {
      row.el.remove();
      cache.delete(k);
    }
  }
}

/** Haptic feedback, if enabled and supported. */
export function vibrate(enabled: boolean, pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

/** localStorage wrappers that never throw (private mode, blocked storage). */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

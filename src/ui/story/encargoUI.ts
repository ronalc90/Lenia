/**
 * Encargos on screen:
 *
 *  offer bubble   pops out of the objective bar: the speaker's animated
 *                 portrait "says" the request, the why-line and the reward,
 *                 then tucks back into the bar after a few seconds. Tap =
 *                 "Why?" → the full dialogue (story.speak).
 *  celebration    when done: the portrait reacts happy, the thanks line, the
 *                 rewards pop one by one, and a burst of particles.
 *  badge          a ready-made objective-bar widget (mini portrait + label +
 *                 progress + "?"), for the UI to mount in its bar.
 *
 * Bubbles wait while a story dialogue is on screen (opts.busy). Reduce motion:
 * fades only, no particles. es/en, mobile first.
 */
import type { Lang, Text } from '../../core/types';
import { COSMETIC_NAMES } from '../../story/encargoScript';
import type { EncargoDone, EncargoView, Encargos } from '../../story/encargos';
import type { Speaker } from '../../story/types';
import { icon } from '../icons';
import { Portrait, setVelaWear } from './portraits';
import { tr } from './strings';

export interface EncargoUIOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  /** Rect of the objective bar ('objective'); bubbles hang from it. */
  getTargetRect?(id: string): DOMRect | null;
  /** A story dialogue / choice / ending is on screen: bubbles wait (pass storyUI.busy). */
  busy?(): boolean;
  onSound?(kind: 'offer' | 'done'): void;
}

export interface EncargoBadge {
  readonly el: HTMLElement;
  dispose(): void;
}

export interface EncargoUI {
  /** A ready-made objective-bar widget (the UI may also draw its own from encargos.current()). */
  mountBadge(container: HTMLElement): EncargoBadge;
  relabel(): void;
  readonly busy: boolean;
  /** Dev / screenshots: show a bubble now (ignores the queue), optionally frozen. */
  readonly debug: { offer(view: EncargoView): void; cheer(done: EncargoDone): void; hold(on: boolean): void };
  dispose(): void;
}

const ACCENT: Record<Speaker, string> = {
  vela: '#5BC0EB',
  albor: '#F2C27B',
  committee: '#FF8A6E',
  coro: '#C9B3FF',
  you: '#8B98A5',
};

const L10N = {
  why: { es: '¿Por qué?', en: 'Why?' } as Text,
  newReq: { es: 'Encargo', en: 'Request' } as Text,
  sideReq: { es: 'Encargo extra', en: 'Extra request' } as Text,
  done: { es: '¡Encargo cumplido!', en: 'Request done!' } as Text,
  journal: { es: 'Bitácora', en: 'Journal' } as Text,
};

type Item = { kind: 'offer'; view: EncargoView } | { kind: 'cheer'; done: EncargoDone };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
  star: boolean;
}

export function createEncargoUI(root: HTMLElement, enc: Encargos, opts: EncargoUIOptions): EncargoUI {
  const L = () => opts.lang();
  const rm = () => opts.reduceMotion?.() ?? false;

  const layer = document.createElement('div');
  layer.className = 'enc';
  const fx = document.createElement('canvas');
  fx.className = 'enc-fx';
  const bubble = document.createElement('div');
  bubble.className = 'enc-bubble';
  bubble.hidden = true;
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  const face = new Portrait('enc-face');
  const body = document.createElement('div');
  body.className = 'enc-body';
  bubble.append(face.canvas, body);
  layer.append(fx, bubble);
  root.appendChild(layer);

  setVelaWear(enc.cosmetics());

  let queue: Item[] = [];
  let showing: Item | null = null;
  let shownAt = 0;
  /** Real-time start (ms): the bubble's on-screen time must not stretch on slow frames. */
  let shownAtMs = 0;
  let duration = 0;
  let hold = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let particles: Particle[] = [];
  const doneIds = new Set<string>();

  // ───────────── content ─────────────

  function rewardChips(r: EncargoView['reward'], big: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = `enc-rewards${big ? ' big' : ''}`;
    const chip = (cls: string, html: string) => {
      const c = document.createElement('span');
      c.className = `enc-chip ${cls}`;
      c.innerHTML = html;
      row.appendChild(c);
    };
    const n = (x: number) => (L() === 'es' ? x.toLocaleString('es-ES') : x.toLocaleString('en-US'));
    if (r.essence > 0) chip('ess', `${icon('essence', 16)}<b>+${n(r.essence)}</b>`);
    if (r.samples > 0) chip('smp', `${icon('samples', 16)}<b>+${n(r.samples)}</b>`);
    if (r.cosmetic) chip('cos', `<i class="enc-gift"></i><b></b>`);
    if (r.journal) chip('jrn', `${icon('journal', 16)}<b></b>`);
    const cos = row.querySelector('.cos b');
    if (cos && r.cosmetic) cos.textContent = tr(COSMETIC_NAMES[r.cosmetic], L());
    const jr = row.querySelector('.jrn b');
    if (jr) jr.textContent = tr(L10N.journal, L());
    return row;
  }

  function fillOffer(v: EncargoView): void {
    bubble.className = `enc-bubble who-${v.who} offer`;
    bubble.style.setProperty('--c', ACCENT[v.who]);
    body.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'enc-head';
    const tag = document.createElement('span');
    tag.className = 'enc-tag';
    tag.textContent = tr(v.kind === 'side' ? L10N.sideReq : L10N.newReq, L());
    const name = document.createElement('span');
    name.className = 'enc-name';
    name.textContent = tr(v.name, L());
    head.append(tag, name);
    const ask = document.createElement('div');
    ask.className = 'enc-ask';
    ask.textContent = tr(v.ask, L());
    const why = document.createElement('div');
    why.className = 'enc-why';
    why.textContent = tr(v.why, L());
    const foot = document.createElement('div');
    foot.className = 'enc-foot';
    const whyBtn = document.createElement('span');
    whyBtn.className = 'enc-whybtn';
    whyBtn.textContent = tr(L10N.why, L());
    foot.append(rewardChips(v.reward, false), whyBtn);
    body.append(head, ask, why, foot);
    face.set(v.who, v.mood);
    bubble.setAttribute('aria-label', `${tr(v.ask, L())}. ${tr(v.why, L())}`);
  }

  function fillCheer(d: EncargoDone): void {
    bubble.className = `enc-bubble who-${d.thanks.who} cheer`;
    bubble.style.setProperty('--c', ACCENT[d.thanks.who]);
    body.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'enc-head';
    const tag = document.createElement('span');
    tag.className = 'enc-tag done';
    tag.textContent = `✓ ${tr(L10N.done, L())}`;
    head.append(tag);
    const ask = document.createElement('div');
    ask.className = 'enc-ask';
    ask.textContent = tr(d.thanks.text, L());
    body.append(head, ask, rewardChips(d.reward, true));
    face.set(d.thanks.who, d.thanks.who === 'committee' || d.thanks.who === 'albor' ? 'neutral' : 'happy');
    bubble.setAttribute('aria-label', `${tr(L10N.done, L())} ${tr(d.thanks.text, L())}`);
  }

  // ───────────── placement ─────────────

  function anchor(): { x: number; y: number; w: number } {
    const r0 = layer.getBoundingClientRect();
    const r = opts.getTargetRect?.('objective') ?? null;
    if (r && r.width > 0) return { x: r.left - r0.left + r.width / 2, y: r.bottom - r0.top + 8, w: r.width };
    return { x: r0.width / 2, y: 64, w: r0.width };
  }

  function place(): void {
    const a = anchor();
    const r0 = layer.getBoundingClientRect();
    const bw = bubble.offsetWidth || 320;
    const x = Math.min(Math.max(10, a.x - bw / 2), r0.width - bw - 10);
    bubble.style.left = `${x.toFixed(1)}px`;
    bubble.style.top = `${a.y.toFixed(1)}px`;
    bubble.style.setProperty('--ax', `${(a.x - x).toFixed(1)}px`);
  }

  // ───────────── particles ─────────────

  function burst(): void {
    if (rm()) return;
    const r0 = layer.getBoundingClientRect();
    const fr = face.canvas.getBoundingClientRect();
    const cx = fr.left - r0.left + fr.width / 2;
    const cy = fr.top - r0.top + fr.height / 2;
    const accent = (showing?.kind === 'cheer' && ACCENT[showing.done.thanks.who]) || '#5BC0EB';
    const colors = [accent, '#FFD166', '#9EF0FF', '#FFFFFF', '#8AE234'];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 230;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0,
        max: 0.9 + Math.random() * 0.8,
        r: 1.6 + Math.random() * 2.6,
        color: colors[i % colors.length],
        star: i % 4 === 0,
      });
    }
  }

  function drawParticles(dt: number): void {
    const ctx = fx.getContext('2d');
    if (!ctx) return;
    const r0 = layer.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r0.width * dpr);
    const H = Math.round(r0.height * dpr);
    if (fx.width !== W || fx.height !== H) {
      fx.width = W;
      fx.height = H;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!particles.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of particles) {
      p.life += dt;
      p.vy += 420 * dt;
      p.vx *= 1 - 1.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.max(0, 1 - p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      if (p.star) {
        const r = p.r * 1.6;
        ctx.moveTo(p.x, p.y - r);
        ctx.quadraticCurveTo(p.x, p.y, p.x + r, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + r);
        ctx.quadraticCurveTo(p.x, p.y, p.x - r, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r);
      } else ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    particles = particles.filter((p) => p.life < p.max);
  }

  // ───────────── queue & loop ─────────────

  function next(): void {
    while (queue.length) {
      const it = queue.shift()!;
      // An offer that was already completed: the cheer tells the story.
      if (it.kind === 'offer' && doneIds.has(it.view.id)) continue;
      show(it);
      return;
    }
  }

  function show(it: Item): void {
    showing = it;
    shownAt = clock;
    shownAtMs = performance.now();
    if (it.kind === 'offer') {
      fillOffer(it.view);
      duration = 6.5;
      opts.onSound?.('offer');
    } else {
      fillCheer(it.done);
      duration = 4.2;
      opts.onSound?.('done');
    }
    bubble.hidden = false;
    bubble.classList.remove('out', 'tuck');
    place();
    void bubble.offsetWidth;
    bubble.classList.add('in');
    if (it.kind === 'cheer') requestAnimationFrame(burst);
    kick();
  }

  function hide(tuck: boolean): void {
    if (!showing) return;
    showing = null;
    bubble.classList.remove('in');
    bubble.classList.add(tuck && !rm() ? 'tuck' : 'out');
    window.setTimeout(() => {
      if (!showing) bubble.hidden = true;
      next();
      kick();
    }, 380);
  }

  function kick(): void {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now: number): void {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    layer.classList.toggle('rm', rm());
    if (!showing && queue.length && !(opts.busy?.() ?? false)) next();
    // A story dialogue took the stage: the offer tucks into the badge (it is there already).
    if (showing?.kind === 'offer' && !hold && (opts.busy?.() ?? false)) hide(true);
    if (showing) {
      const age = clock - shownAt;
      // The portrait "speaks" the first moments of an offer.
      const talking = showing.kind === 'offer' && age < 1.6 && !rm();
      const target = talking ? 0.4 + 0.6 * Math.abs(Math.sin(age * 17)) : 0;
      face.state.reduceMotion = rm();
      face.frame(clock, dt, target, talking);
      if (showing.kind === 'cheer' && age > 0.45 && age - dt <= 0.45) face.set(showing.done.thanks.who, 'awed');
      if (showing.kind === 'cheer' && age > 1.4 && age - dt <= 1.4) face.set(showing.done.thanks.who, showing.done.thanks.who === 'vela' ? 'happy' : 'neutral');
      place();
      if (!hold && (now - shownAtMs) / 1000 > duration) hide(showing.kind === 'offer');
    }
    drawParticles(dt);
    if (showing || queue.length || particles.length) raf = requestAnimationFrame(frame);
  }

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    const it = showing;
    if (!it) return;
    if (it.kind === 'offer') {
      hide(true);
      enc.why(it.view.id);
    } else hide(false);
  });

  // ───────────── wiring ─────────────

  const offs = [
    enc.on('offer', ({ encargo }) => {
      doneIds.delete(encargo.id);
      queue.push({ kind: 'offer', view: encargo });
      kick();
    }),
    enc.on('done', (d) => {
      doneIds.add(d.encargo.id);
      // Drop a pending offer of the same request: it is already done.
      queue = queue.filter((q) => !(q.kind === 'offer' && q.view.id === d.encargo.id));
      if (showing?.kind === 'offer' && showing.view.id === d.encargo.id) hide(true);
      queue.push({ kind: 'cheer', done: d });
      setVelaWear(enc.cosmetics());
      kick();
    }),
    enc.on('change', () => setVelaWear(enc.cosmetics())),
  ];

  // ───────────── badge ─────────────

  function mountBadge(container: HTMLElement): EncargoBadge {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'enc-badge';
    el.hidden = true;
    const mini = new Portrait('enc-mini');
    const text = document.createElement('span');
    text.className = 'enc-badge-text';
    const bar = document.createElement('span');
    bar.className = 'enc-badge-bar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'enc-badge-num';
    const row = document.createElement('span');
    row.className = 'enc-badge-row';
    row.append(bar, num);
    const q = document.createElement('span');
    q.className = 'enc-badge-q';
    q.textContent = '?';
    const mid = document.createElement('span');
    mid.className = 'enc-badge-mid';
    mid.append(text, row);
    el.append(mini.canvas, mid, q);
    container.appendChild(el);
    let cur: EncargoView | null = null;
    const render = () => {
      cur = enc.current();
      el.hidden = !cur;
      if (!cur) return;
      el.style.setProperty('--c', ACCENT[cur.who]);
      el.classList.toggle('side', cur.kind === 'side');
      text.textContent = tr(cur.ask, L());
      fill.style.width = `${Math.round(cur.progress.frac * 100)}%`;
      num.textContent = tr(cur.count, L());
      row.hidden = cur.progress.unit === 'flag';
      el.setAttribute('aria-label', `${tr(cur.label, L())}. ${tr(L10N.why, L())}`);
      mini.set(cur.who, cur.mood);
    };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cur) enc.why(cur.id);
    });
    let braf = 0;
    let bl = performance.now();
    const loop = (now: number) => {
      if (!el.isConnected) {
        braf = 0;
        return;
      }
      const dt = Math.min(0.1, (now - bl) / 1000);
      bl = now;
      mini.state.reduceMotion = rm();
      if (!el.hidden) mini.frame(now / 1000, dt, 0, false);
      braf = requestAnimationFrame(loop);
    };
    braf = requestAnimationFrame(loop);
    const timer = window.setInterval(render, 1000);
    const offB = [
      enc.on('offer', render),
      enc.on('progress', render),
      enc.on('change', render),
      enc.on('done', () => {
        el.classList.remove('cheer');
        void el.offsetWidth;
        el.classList.add('cheer');
        render();
      }),
    ];
    render();
    return {
      el,
      dispose() {
        for (const o of offB) o();
        window.clearInterval(timer);
        if (braf) cancelAnimationFrame(braf);
        el.remove();
      },
    };
  }

  return {
    mountBadge,
    relabel() {
      if (!showing) return;
      if (showing.kind === 'offer') fillOffer(showing.view);
      else fillCheer(showing.done);
      bubble.classList.add('in');
    },
    get busy() {
      return !!showing;
    },
    debug: {
      offer(view) {
        queue = [];
        show({ kind: 'offer', view });
      },
      cheer(done) {
        queue = [];
        show({ kind: 'cheer', done });
      },
      hold(on) {
        hold = on;
      },
    },
    dispose() {
      for (const o of offs) o();
      if (raf) cancelAnimationFrame(raf);
      layer.remove();
    },
  };
}
